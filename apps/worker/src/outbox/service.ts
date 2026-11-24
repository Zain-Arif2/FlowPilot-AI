import { createHash, randomUUID } from "node:crypto";
import type { OutboxEvent, Prisma, PrismaClient } from "@flowpilot/db";
import { z } from "zod";
import type { Queue } from "bullmq";
import { UuidSchema } from "@flowpilot/shared";
import {
  OUTBOX_QUEUE,
  OutboxDispatchJobSchema,
  type OutboxDispatchJob,
} from "../queue/contracts.js";

export const OutboxEventTypeSchema = z.enum([
  "execution.start",
  "execution.continue",
  "execution.cancel",
  "execution.artifact.cleanup",
  "document.validate",
  "object.delete",
]);

export const OutboxPayloadSchema = z
  .object({
    workspaceId: UuidSchema,
    userId: UuidSchema,
    aggregateId: UuidSchema,
  })
  .strict();

export interface CreateOutboxEventInput {
  readonly eventType: z.infer<typeof OutboxEventTypeSchema>;
  readonly userId: string;
  readonly workspaceId: string;
  readonly aggregateId: string;
}

export const MAX_OUTBOX_PUBLISH_ATTEMPTS = 10;

export class OutboxRetryLimitError extends Error {
  constructor(readonly outboxEventId: string) {
    super(`Outbox event ${outboxEventId} reached its publish retry limit.`);
    this.name = "OutboxRetryLimitError";
  }
}

export async function createOutboxEvent(
  transaction: Prisma.TransactionClient,
  input: CreateOutboxEventInput,
): Promise<OutboxEvent> {
  const payload = OutboxPayloadSchema.parse({
    workspaceId: input.workspaceId,
    userId: input.userId,
    aggregateId: input.aggregateId,
  });
  return transaction.outboxEvent.create({
    data: {
      eventKey: `${input.eventType}:${input.aggregateId}:${randomUUID()}`,
      eventType: input.eventType,
      aggregateId: input.aggregateId,
      payload,
    },
  });
}

export function createOutboxJobId(eventKey: string): string {
  const digest = createHash("sha256").update(eventKey).digest("hex");
  return `outbox-${digest}`;
}

export async function dispatchOutboxEvent(
  client: PrismaClient,
  queue: Queue<OutboxDispatchJob>,
  outboxEventId: string,
): Promise<boolean> {
  const event = await client.outboxEvent.findUnique({ where: { id: outboxEventId } });
  if (!event || event.publishedAt) return false;
  if (event.attemptCount >= MAX_OUTBOX_PUBLISH_ATTEMPTS) {
    throw new OutboxRetryLimitError(event.id);
  }

  const jobPayload = OutboxDispatchJobSchema.parse({ outboxEventId: event.id });
  try {
    await queue.add(OUTBOX_QUEUE, jobPayload, {
      jobId: createOutboxJobId(event.eventKey),
      attempts: 5,
      backoff: { type: "exponential", delay: 1_000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    });
  } catch (error) {
    await client.outboxEvent.update({
      where: { id: event.id },
      data: { attemptCount: { increment: 1 } },
    });
    throw error;
  }

  const updated = await client.outboxEvent.updateMany({
    where: { id: event.id, publishedAt: null },
    data: { publishedAt: new Date(), attemptCount: { increment: 1 } },
  });
  return updated.count === 1;
}

export async function dispatchPendingOutboxEvents(
  client: PrismaClient,
  queue: Queue<OutboxDispatchJob>,
  limit = 50,
): Promise<number> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new RangeError("Outbox dispatch limit must be between 1 and 500.");
  }
  const pending = await client.outboxEvent.findMany({
    where: { publishedAt: null },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });
  let published = 0;
  for (const event of pending) {
    if (await dispatchOutboxEvent(client, queue, event.id)) published += 1;
  }
  return published;
}

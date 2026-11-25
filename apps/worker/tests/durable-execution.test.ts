import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "@flowpilot/db";
import { OUTBOX_QUEUE, OutboxDispatchJobSchema } from "../src/queue/contracts.js";
import { createOutboxJobId, dispatchOutboxEvent } from "../src/outbox/service.js";

const redisUrl = process.env.REDIS_URL;
const databaseUrl = process.env.DATABASE_URL;
if (!redisUrl || !databaseUrl) {
  throw new Error(
    "Durable execution integration tests require dedicated non-production Redis and database URLs; apply migrations before running.",
  );
}

const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const integrationQueueName = `${OUTBOX_QUEUE}-test-${randomUUID()}`;
const queue = new Queue(integrationQueueName, { connection });
let integrationEventId: string | undefined;

beforeAll(async () => {
  await connection.ping();
  await prisma.$connect();
});

afterAll(async () => {
  if (integrationEventId) {
    await prisma.outboxEvent.deleteMany({ where: { id: integrationEventId } });
  }
  await queue.obliterate({ force: true });
  await queue.close();
  await connection.quit();
  await prisma.$disconnect();
});

describe("durable queue and outbox integration", () => {
  it("publishes an identifier-only outbox job and de-duplicates publication", async () => {
    const eventId = randomUUID();
    const workspaceId = randomUUID();
    const event = await prisma.outboxEvent.create({
      data: {
        eventKey: `integration:${eventId}`,
        eventType: "execution.start",
        aggregateId: eventId,
        payload: {
          workspaceId,
          userId: randomUUID(),
          aggregateId: eventId,
        },
      },
    });
    integrationEventId = event.id;

    expect(await dispatchOutboxEvent(prisma, queue, event.id)).toBe(true);
    expect(await dispatchOutboxEvent(prisma, queue, event.id)).toBe(false);
    const job = await queue.getJob(createOutboxJobId(event.eventKey));
    expect(job?.data).toEqual(
      OutboxDispatchJobSchema.parse({ outboxEventId: event.id }),
    );
    const saved = await prisma.outboxEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(saved.publishedAt).toBeInstanceOf(Date);
  });

  it("retains queued work across a worker restart and de-duplicates the job", async () => {
    const jobId = `restart-${randomUUID()}`;
    const payload = { outboxEventId: randomUUID() };
    const effects = new Set<string>();
    await queue.add(OUTBOX_QUEUE, payload, {
      jobId,
      attempts: 2,
      removeOnComplete: false,
    });

    const processor = async (job: { data: unknown }): Promise<void> => {
      const parsed = OutboxDispatchJobSchema.parse(job.data);
      effects.add(parsed.outboxEventId);
    };
    const firstWorker = new Worker(integrationQueueName, processor, {
      connection,
      autorun: false,
    });
    await firstWorker.waitUntilReady();
    await firstWorker.close();

    const duplicate = await queue.add(OUTBOX_QUEUE, payload, {
      jobId,
      attempts: 2,
      removeOnComplete: false,
    });
    expect(duplicate.id).toBe(jobId);

    const secondWorker = new Worker(integrationQueueName, processor, { connection });
    await secondWorker.waitUntilReady();
    const deadline = Date.now() + 10_000;
    let state = await duplicate.getState();
    while (state !== "completed" && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      state = await duplicate.getState();
    }
    await secondWorker.close();
    expect(state).toBe("completed");
    expect(effects.size).toBe(1);
  });
});

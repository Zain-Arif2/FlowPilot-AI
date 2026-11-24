import { createHash } from "node:crypto";
import type { Queue } from "bullmq";
import type { PrismaClient } from "@flowpilot/db/client";
import {
  CleanupJobSchema,
  DocumentValidationJobSchema,
  WorkflowExecutionJobSchema,
  type CleanupJob,
  type DocumentValidationJob,
  type OutboxDispatchJob,
  type WorkflowExecutionJob,
} from "../queue/contracts.js";
import { OutboxEventTypeSchema, OutboxPayloadSchema } from "./service.js";

interface OutboxQueues {
  readonly workflowQueue: Queue<WorkflowExecutionJob>;
  readonly documentQueue: Queue<DocumentValidationJob>;
  readonly cleanupQueue: Queue<CleanupJob>;
}

function outboxJobId(eventKey: string): string {
  return `event-${createHash("sha256").update(eventKey).digest("hex")}`;
}

export function createOutboxProcessor(client: PrismaClient, queues: OutboxQueues) {
  return async (job: OutboxDispatchJob): Promise<void> => {
    const event = await client.outboxEvent.findUnique({
      where: { id: job.outboxEventId },
    });
    if (!event) {
      throw new Error("The outbox event referenced by the queue job was not found.");
    }

    const eventType = OutboxEventTypeSchema.parse(event.eventType);
    const payload = OutboxPayloadSchema.parse(event.payload);
    const options = {
      jobId: outboxJobId(event.eventKey),
      attempts: 5,
      backoff: { type: "exponential" as const, delay: 1_000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    };

    switch (eventType) {
      case "execution.start":
      case "execution.continue":
        await queues.workflowQueue.add(
          eventType,
          WorkflowExecutionJobSchema.parse({
            executionId: payload.aggregateId,
            workspaceId: payload.workspaceId,
            userId: payload.userId,
          }),
          options,
        );
        return;
      case "document.validate":
        await queues.documentQueue.add(
          eventType,
          DocumentValidationJobSchema.parse({
            documentId: payload.aggregateId,
            workspaceId: payload.workspaceId,
            userId: payload.userId,
          }),
          options,
        );
        return;
      case "object.delete":
        await queues.cleanupQueue.add(
          eventType,
          CleanupJobSchema.parse({
            cleanupType: "document",
            aggregateId: payload.aggregateId,
            workspaceId: payload.workspaceId,
            userId: payload.userId,
          }),
          options,
        );
        return;
      case "execution.artifact.cleanup":
      case "execution.cancel":
        await queues.cleanupQueue.add(
          eventType,
          CleanupJobSchema.parse({
            cleanupType: "execution_artifacts",
            aggregateId: payload.aggregateId,
            workspaceId: payload.workspaceId,
            userId: payload.userId,
          }),
          options,
        );
    }
  };
}

import { Queue, QueueEvents, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { buildRedisClientOptions } from "@flowpilot/shared/redis";
import {
  OUTBOX_QUEUE,
  OutboxDispatchJobSchema,
  WORKFLOW_QUEUE,
  WorkflowExecutionJobSchema,
  DOCUMENT_QUEUE,
  DocumentValidationJobSchema,
  CLEANUP_QUEUE,
  CleanupJobSchema,
  type OutboxDispatchJob,
  type WorkflowExecutionJob,
  type DocumentValidationJob,
  type CleanupJob,
} from "./contracts.js";

export interface QueueRuntime {
  readonly connection: Redis;
  readonly workflowQueue: Queue<WorkflowExecutionJob>;
  readonly outboxQueue: Queue<OutboxDispatchJob>;
  readonly documentQueue: Queue<DocumentValidationJob>;
  readonly cleanupQueue: Queue<CleanupJob>;
  readonly workflowEvents: QueueEvents;
  readonly outboxEvents: QueueEvents;
  readonly documentEvents: QueueEvents;
  readonly cleanupEvents: QueueEvents;
  close(): Promise<void>;
}

export function createQueueRuntime(redisUrl: string): QueueRuntime {
  const connection = new Redis(
    redisUrl,
    buildRedisClientOptions(redisUrl, "bullmq"),
  );
  const workflowQueue = new Queue<WorkflowExecutionJob>(WORKFLOW_QUEUE, { connection });
  const outboxQueue = new Queue<OutboxDispatchJob>(OUTBOX_QUEUE, { connection });
  const documentQueue = new Queue<DocumentValidationJob>(DOCUMENT_QUEUE, { connection });
  const cleanupQueue = new Queue<CleanupJob>(CLEANUP_QUEUE, { connection });
  const workflowEvents = new QueueEvents(WORKFLOW_QUEUE, { connection });
  const outboxEvents = new QueueEvents(OUTBOX_QUEUE, { connection });
  const documentEvents = new QueueEvents(DOCUMENT_QUEUE, { connection });
  const cleanupEvents = new QueueEvents(CLEANUP_QUEUE, { connection });

  return {
    connection,
    workflowQueue,
    outboxQueue,
    documentQueue,
    cleanupQueue,
    workflowEvents,
    outboxEvents,
    documentEvents,
    cleanupEvents,
    async close() {
      await Promise.all([
        workflowEvents.close(),
        outboxEvents.close(),
        documentEvents.close(),
        cleanupEvents.close(),
        workflowQueue.close(),
        outboxQueue.close(),
        documentQueue.close(),
        cleanupQueue.close(),
      ]);
      await connection.quit();
    },
  };
}

export type WorkflowProcessor = (
  payload: WorkflowExecutionJob,
  job: Job<WorkflowExecutionJob>,
) => Promise<void>;

export function createWorkflowWorker(
  connection: Redis,
  processor: WorkflowProcessor,
): Worker<WorkflowExecutionJob> {
  return new Worker<WorkflowExecutionJob>(
    WORKFLOW_QUEUE,
    async (job) => {
      const payload = WorkflowExecutionJobSchema.parse(job.data);
      await processor(payload, job);
    },
    { connection, concurrency: 4 },
  );
}

export function createOutboxWorker(
  connection: Redis,
  processor: (payload: OutboxDispatchJob) => Promise<void>,
): Worker<OutboxDispatchJob> {
  return new Worker<OutboxDispatchJob>(
    OUTBOX_QUEUE,
    async (job) => {
      const payload = OutboxDispatchJobSchema.parse(job.data);
      await processor(payload);
    },
    { connection, concurrency: 2 },
  );
}

export function createDocumentWorker(
  connection: Redis,
  processor: (payload: DocumentValidationJob) => Promise<void>,
): Worker<DocumentValidationJob> {
  return new Worker<DocumentValidationJob>(
    DOCUMENT_QUEUE,
    async (job) => {
      const payload = DocumentValidationJobSchema.parse(job.data);
      await processor(payload);
    },
    { connection, concurrency: 2 },
  );
}

export function createCleanupWorker(
  connection: Redis,
  processor: (payload: CleanupJob) => Promise<void>,
): Worker<CleanupJob> {
  return new Worker<CleanupJob>(
    CLEANUP_QUEUE,
    async (job) => {
      const payload = CleanupJobSchema.parse(job.data);
      await processor(payload);
    },
    { connection, concurrency: 2 },
  );
}

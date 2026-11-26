import {
  createDocumentRepository,
  createExecutionRepository,
  createExecutionArtifactRepository,
  createReportRepository,
  createWorkspaceRepository,
} from "@flowpilot/db/repositories";
import { createOpenRouterAdapter } from "@flowpilot/shared/ai/openrouter";
import { parseRedisUrl, waitForRedisReadyAndPing } from "@flowpilot/shared/redis";
import { prisma } from "@flowpilot/db/client";
import { createWorkerObjectStorage } from "./adapters/object-storage.js";
import { createCleanupProcessor } from "./processors/cleanup.processor.js";
import { createDocumentValidationProcessor } from "./processors/document.processor.js";
import { createWorkflowExecutionProcessor } from "./processors/workflow.processor.js";
import { createOutboxProcessor } from "./outbox/processor.js";
import { dispatchPendingOutboxEvents } from "./outbox/service.js";
import {
  createCleanupWorker,
  createDocumentWorker,
  createOutboxWorker,
  createQueueRuntime,
  createWorkflowWorker,
} from "./queue/runtime.js";
import { workerLogger } from "./logger.js";

export async function startWorkerFoundation(): Promise<void> {
  const required = (name: string): string => {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is required to start the worker.`);
    return value;
  };

  const storageConfig = {
    cloudName: required("CLOUDINARY_CLOUD_NAME"),
    apiKey: required("CLOUDINARY_API_KEY"),
    apiSecret: required("CLOUDINARY_API_SECRET"),
  };
  const documentMaxBytes = Number(process.env.DOCUMENT_MAX_BYTES ?? "10000000");
  if (
    !Number.isInteger(documentMaxBytes) ||
    documentMaxBytes < 1 ||
    documentMaxBytes > 20_000_000
  ) {
    throw new Error("DOCUMENT_MAX_BYTES must be an integer from 1 to 20000000.");
  }
  const signedUrlTtlSeconds = Number(
    process.env.CLOUDINARY_SIGNED_URL_TTL_SECONDS ?? "300",
  );
  if (
    !Number.isInteger(signedUrlTtlSeconds) ||
    signedUrlTtlSeconds < 60 ||
    signedUrlTtlSeconds > 3_600
  ) {
    throw new Error(
      "CLOUDINARY_SIGNED_URL_TTL_SECONDS must be an integer from 60 to 3600.",
    );
  }
  const openRouterTimeoutMs = Number(process.env.OPENROUTER_TIMEOUT_MS ?? "30000");
  if (
    !Number.isInteger(openRouterTimeoutMs) ||
    openRouterTimeoutMs < 1_000 ||
    openRouterTimeoutMs > 120_000
  ) {
    throw new Error("OPENROUTER_TIMEOUT_MS must be an integer from 1000 to 120000.");
  }
  const redisUrl = required("REDIS_URL");
  const redisTarget = parseRedisUrl(redisUrl);
  await prisma.$connect();
  const runtime = createQueueRuntime(redisUrl);
  const handleRedisError = (error: Error): void => {
    workerLogger.error(
      {
        errorName: error.name,
        redisHost: redisTarget.host,
        redisPort: redisTarget.port,
        redisTls: redisTarget.tls,
      },
      "Worker Redis client reported an error",
    );
  };
  runtime.connection.on("error", handleRedisError);
  runtime.workflowEvents.on("error", handleRedisError);
  runtime.outboxEvents.on("error", handleRedisError);
  runtime.documentEvents.on("error", handleRedisError);
  runtime.cleanupEvents.on("error", handleRedisError);
  try {
    await waitForRedisReadyAndPing(runtime.connection, redisTarget);
  } catch (error) {
    workerLogger.error(
      {
        errorName: error instanceof Error ? error.name : "UNKNOWN",
        errorMessage:
          error instanceof Error ? error.message : "Unknown Redis startup error",
        redisHost: redisTarget.host,
        redisPort: redisTarget.port,
        redisTls: redisTarget.tls,
      },
      "Worker Redis startup check failed",
    );
    await runtime.close();
    await prisma.$disconnect();
    throw error;
  }
  const storage = createWorkerObjectStorage({
    ...storageConfig,
  });
  const documents = createDocumentRepository(prisma);
  const executions = createExecutionRepository(prisma);
  const artifacts = createExecutionArtifactRepository(prisma);
  const workflowProcessor = createWorkflowExecutionProcessor({
    executions,
    documents,
    reports: createReportRepository(prisma),
    workspaces: createWorkspaceRepository(prisma),
    storage,
    analysisClient: createOpenRouterAdapter({
      apiKey: required("OPENROUTER_API_KEY"),
      model: required("OPENROUTER_MODEL"),
      timeoutMs: openRouterTimeoutMs,
    }),
  });
  const outboxWorker = createOutboxWorker(
    runtime.connection,
    createOutboxProcessor(prisma, runtime),
  );
  const documentWorker = createDocumentWorker(
    runtime.connection,
    createDocumentValidationProcessor(documents, storage),
  );
  const cleanupWorker = createCleanupWorker(
    runtime.connection,
    createCleanupProcessor(documents, artifacts, storage),
  );
  const workflowWorker = createWorkflowWorker(runtime.connection, (job) =>
    workflowProcessor(job),
  );

  const handleWorkerError = (error: Error): void => {
    workerLogger.error(
      { errorName: error.name },
      "Background worker reported an error",
    );
  };
  outboxWorker.on("error", handleWorkerError);
  workflowWorker.on("error", handleWorkerError);
  documentWorker.on("error", handleWorkerError);
  cleanupWorker.on("error", handleWorkerError);
  workerLogger.info({}, "Workflow, document, and cleanup workers connected");

  let dispatching = false;
  const dispatch = async (): Promise<void> => {
    if (dispatching) return;
    dispatching = true;
    try {
      await dispatchPendingOutboxEvents(prisma, runtime.outboxQueue);
    } catch (error) {
      workerLogger.error(
        { errorName: error instanceof Error ? error.name : "UNKNOWN" },
        "Outbox dispatch failed",
      );
    } finally {
      dispatching = false;
    }
  };
  await dispatch();
  const dispatchTimer = setInterval(() => void dispatch(), 1_000);

  let shutdownTask: Promise<void> | undefined;
  const shutdown = async (): Promise<void> => {
    if (shutdownTask) return shutdownTask;
    clearInterval(dispatchTimer);
    shutdownTask = (async () => {
      await Promise.all([
        outboxWorker.close(),
        workflowWorker.close(),
        documentWorker.close(),
        cleanupWorker.close(),
      ]);
      await runtime.close();
      await prisma.$disconnect();
      workerLogger.info({}, "Background workers stopped");
    })();
    return shutdownTask;
  };
  process.once("SIGINT", () => {
    void shutdown().catch((error: unknown) => {
      workerLogger.error(
        { errorName: error instanceof Error ? error.name : "UNKNOWN" },
        "Background worker shutdown failed",
      );
      process.exitCode = 1;
    });
  });
  process.once("SIGTERM", () => {
    void shutdown().catch((error: unknown) => {
      workerLogger.error(
        { errorName: error instanceof Error ? error.name : "UNKNOWN" },
        "Background worker shutdown failed",
      );
      process.exitCode = 1;
    });
  });
}

if (process.argv[1]?.endsWith("main.ts") || process.argv[1]?.endsWith("main.js")) {
  await startWorkerFoundation();
}

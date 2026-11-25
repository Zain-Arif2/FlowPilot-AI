import { Redis } from "ioredis";
import {
  buildRedisClientOptions,
  parseRedisUrl,
  waitForRedisReadyAndPing,
} from "@flowpilot/shared/redis";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { apiLogger } from "./middleware/logger.js";
import { prisma } from "@flowpilot/db/client";
import {
  createApprovalRepository,
  createAuthRepository,
  createWorkspaceRepository,
} from "@flowpilot/db/repositories";
import { createAuthService } from "./modules/auth/service.js";
import { argon2idPasswordHasher } from "./modules/auth/password.js";
import { createWorkspaceService } from "./modules/workspaces/service.js";
import { createObjectStorage } from "./adapters/object-storage.js";
import { createDocumentService } from "./modules/documents/service.js";
import { createDocumentRepository } from "@flowpilot/db/repositories";
import { createWorkflowRepository } from "@flowpilot/db/repositories";
import { createWorkflowProposalService } from "./modules/workflows/proposal.js";
import { createWorkflowService } from "./modules/workflows/service.js";
import { createOpenRouterAdapter } from "./adapters/openrouter.js";
import {
  createExecutionHistoryRepository,
  createExecutionRepository,
} from "@flowpilot/db/repositories";
import { createExecutionService } from "./modules/executions/create.js";
import { createExecutionHistoryService } from "./modules/executions/history.js";
import { createReportRepository } from "@flowpilot/db/repositories";
import { createReportService } from "./modules/reports/service.js";
import { createApprovalService } from "./modules/approvals/service.js";
import {
  createRateLimitMiddleware,
  createRedisRateLimitStore,
} from "./middleware/rate-limit.js";

const config = readConfig();
const redisTarget = parseRedisUrl(config.REDIS_URL);
const rateLimitRedis = new Redis(
  config.REDIS_URL,
  buildRedisClientOptions(config.REDIS_URL, "rate-limit"),
);
rateLimitRedis.on("error", (error: Error) => {
  apiLogger.error(
    {
      errorName: error.name,
      redisHost: redisTarget.host,
      redisPort: redisTarget.port,
      redisTls: redisTarget.tls,
    },
    "API rate-limit Redis error",
  );
});
try {
  await Promise.all([
    prisma.$connect(),
    waitForRedisReadyAndPing(rateLimitRedis, redisTarget),
  ]);
} catch (error) {
  apiLogger.error(
    {
      errorName: error instanceof Error ? error.name : "UNKNOWN",
      errorMessage: error instanceof Error ? error.message : "Unknown startup error",
      redisHost: redisTarget.host,
      redisPort: redisTarget.port,
      redisTls: redisTarget.tls,
    },
    "API dependency startup check failed",
  );
  rateLimitRedis.disconnect();
  await prisma.$disconnect();
  throw error;
}
const objectStorage = createObjectStorage(config);
const workflowProposalService = createWorkflowProposalService(
  createOpenRouterAdapter({
    apiKey: config.OPENROUTER_API_KEY,
    model: config.OPENROUTER_MODEL,
    timeoutMs: config.OPENROUTER_TIMEOUT_MS,
  }),
  createDocumentRepository(prisma),
);
const services = {
  auth: createAuthService(createAuthRepository(prisma), argon2idPasswordHasher, {
    accessSecret: config.JWT_ACCESS_SECRET,
    refreshSecret: config.JWT_REFRESH_SECRET,
    issuer: config.JWT_ISSUER,
    audience: config.JWT_AUDIENCE,
    accessTtlSeconds: config.JWT_ACCESS_TTL_SECONDS,
    refreshTtlSeconds: config.JWT_REFRESH_TTL_SECONDS,
  }),
  workspaces: createWorkspaceService(createWorkspaceRepository(prisma)),
  documents: createDocumentService(createDocumentRepository(prisma), objectStorage),
  workflows: createWorkflowService(
    createWorkflowRepository(prisma),
    workflowProposalService,
  ),
  executions: createExecutionService(
    createExecutionRepository(prisma),
    createExecutionHistoryService(createExecutionHistoryRepository(prisma)),
  ),
  reports: createReportService(createReportRepository(prisma)),
  approvals: createApprovalService(createApprovalRepository(prisma)),
  rateLimiter: createRateLimitMiddleware(
    createRedisRateLimitStore(rateLimitRedis),
  ),
  async checkReadiness() {
    await prisma.$queryRaw`SELECT 1`;
    await rateLimitRedis.ping();
  },
};
const server = createApp(config, services).listen(config.API_PORT, () => {
  apiLogger.info({ port: config.API_PORT }, "FlowPilot API listening");
});

const shutdown = (): void => {
  server.close((error) => {
    if (error) {
      apiLogger.error({ errorName: error.name }, "API shutdown failed");
      process.exitCode = 1;
    }
    rateLimitRedis.disconnect();
    void prisma.$disconnect().catch((disconnectError: unknown) => {
      apiLogger.error(
        {
          errorName:
            disconnectError instanceof Error ? disconnectError.name : "UNKNOWN",
        },
        "API database shutdown failed",
      );
      process.exitCode = 1;
    });
  });
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

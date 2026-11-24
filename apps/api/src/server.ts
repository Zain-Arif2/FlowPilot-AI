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
import { createExecutionRepository } from "@flowpilot/db/repositories";
import { createExecutionService } from "./modules/executions/create.js";
import { createReportRepository } from "@flowpilot/db/repositories";
import { createReportService } from "./modules/reports/service.js";
import { createApprovalService } from "./modules/approvals/service.js";

const config = readConfig();
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
  auth: createAuthService(createAuthRepository(prisma), argon2idPasswordHasher),
  workspaces: createWorkspaceService(createWorkspaceRepository(prisma)),
  documents: createDocumentService(createDocumentRepository(prisma), objectStorage),
  workflows: createWorkflowService(
    createWorkflowRepository(prisma),
    workflowProposalService,
  ),
  executions: createExecutionService(createExecutionRepository(prisma)),
  reports: createReportService(createReportRepository(prisma)),
  approvals: createApprovalService(createApprovalRepository(prisma)),
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
  });
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

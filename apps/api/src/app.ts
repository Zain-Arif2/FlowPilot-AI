import express, { type Express } from "express";
import { readConfig, type AppConfig } from "./config.js";
import { errorHandler } from "./middleware/error.js";
import { requestContext } from "./middleware/request-context.js";
import { createRequestLogger } from "./middleware/logger.js";
import { createCorsPolicy } from "./middleware/cors.js";
import { createCsrfProtection } from "./middleware/csrf.js";
import { createSessionAuthentication } from "./middleware/session.js";
import { createAuthRouter } from "./modules/auth/routes.js";
import { createWorkspaceRouter } from "./modules/workspaces/routes.js";
import { createDocumentRouter } from "./modules/documents/routes.js";
import { createWorkflowRouter } from "./modules/workflows/routes.js";
import { createExecutionRouter } from "./modules/executions/routes.js";
import { createReportRouter } from "./modules/reports/routes.js";
import { createApprovalRouter } from "./modules/approvals/routes.js";
import type {
  ApprovalService,
  AuthService,
  DocumentService,
  ExecutionService,
  ReportService,
  WorkflowService,
  WorkspaceService,
} from "./services/contracts.js";

export interface ApiServices {
  readonly auth: AuthService;
  readonly workspaces: WorkspaceService;
  readonly documents?: DocumentService;
  readonly workflows?: WorkflowService;
  readonly executions?: ExecutionService;
  readonly reports?: ReportService;
  readonly approvals?: ApprovalService;
}

export function createApp(
  config: AppConfig = readConfig(),
  services?: ApiServices,
): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(requestContext);
  app.use(createRequestLogger());
  app.use(express.json({ limit: config.API_BODY_LIMIT, strict: true }));

  const api = express.Router();
  api.use(createCorsPolicy(config.APP_ORIGIN));
  api.get("/healthz", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });
  if (services) {
    api.use(createCsrfProtection(config.APP_ORIGIN));
    const authenticate = createSessionAuthentication(
      services.auth.resolveSession.bind(services.auth),
      config.SESSION_COOKIE_NAME,
    );
    api.use(createAuthRouter(services.auth, config, authenticate));
    api.use("/workspaces", createWorkspaceRouter(services.workspaces, authenticate));
    if (services.documents) {
      api.use(
        "/workspaces",
        createDocumentRouter(services.documents, services.workspaces, authenticate),
      );
    }
    if (services.workflows) {
      api.use(
        "/workspaces",
        createWorkflowRouter(services.workflows, services.workspaces, authenticate),
      );
    }
    if (services.executions) {
      api.use(
        "/workspaces",
        createExecutionRouter(services.executions, services.workspaces, authenticate),
      );
    }
    if (services.reports) {
      api.use(
        "/workspaces",
        createReportRouter(services.reports, services.workspaces, authenticate),
      );
    }
    if (services.approvals) {
      api.use(
        "/workspaces",
        createApprovalRouter(services.approvals, services.workspaces, authenticate),
      );
    }
  }
  app.use("/api/v1", api);
  app.use(errorHandler);
  return app;
}

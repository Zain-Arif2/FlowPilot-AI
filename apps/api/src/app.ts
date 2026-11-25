import express, { type Express, type RequestHandler } from "express";
import { readConfig, getAuthCookieNames, type AppConfig } from "./config.js";
import { errorHandler } from "./middleware/error.js";
import { requestContext } from "./middleware/request-context.js";
import { createRequestLogger } from "./middleware/logger.js";
import { createCorsPolicy } from "./middleware/cors.js";
import { createCsrfProtection } from "./middleware/csrf.js";
import { createJwtAuthentication } from "./middleware/auth.js";
import { createAuthRouter } from "./modules/auth/routes.js";
import { createWorkspaceRouter } from "./modules/workspaces/routes.js";
import { createDocumentRouter } from "./modules/documents/routes.js";
import { createWorkflowRouter } from "./modules/workflows/routes.js";
import { createExecutionRouter } from "./modules/executions/routes.js";
import { createReportRouter } from "./modules/reports/routes.js";
import { createApprovalRouter } from "./modules/approvals/routes.js";
import { apiLogger } from "./middleware/logger.js";
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
  readonly rateLimiter?: RequestHandler;
  readonly checkReadiness?: () => Promise<void>;
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
  api.get("/readyz", async (_request, response) => {
    if (!services?.checkReadiness) {
      response.status(503).json({ status: "not_ready" });
      return;
    }

    try {
      await services.checkReadiness();
    } catch (error) {
      apiLogger.error(
        { errorName: error instanceof Error ? error.name : "UNKNOWN" },
        "API readiness check failed",
      );
      response.status(503).json({ status: "not_ready" });
      return;
    }
    response.status(200).json({ status: "ready" });
  });
  if (services) {
    api.use(createCsrfProtection(config.APP_ORIGIN));
    if (services.rateLimiter) api.use(services.rateLimiter);
    const { accessCookieName } = getAuthCookieNames(config.COOKIE_SECURE);
    const authenticate = createJwtAuthentication(
      services.auth.verifyAccessToken.bind(services.auth),
      accessCookieName,
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

import { Router, type RequestHandler } from "express";
import type { Router as ExpressRouter } from "express";
import {
  ReportListSchema,
  ReportSchema,
  UuidSchema,
} from "@flowpilot/shared";
import { HttpError } from "../../errors/api-error.js";
import { createWorkspaceAuthorization } from "../../middleware/workspace.js";
import type {
  ReportService,
  WorkspaceService,
} from "../../services/contracts.js";

export function createReportRouter(
  service: ReportService,
  workspaces: WorkspaceService,
  authenticate: RequestHandler,
): ExpressRouter {
  const router = Router();
  router.use(authenticate);
  const authorizeWorkspace = createWorkspaceAuthorization(({ userId, workspaceId }) =>
    workspaces.verifyOwner(userId, workspaceId),
  );

  router.get("/:workspaceId/reports", authorizeWorkspace, async (request, response) => {
    const user = request.authUser;
    const workspaceId = request.params.workspaceId;
    if (!user || typeof workspaceId !== "string") {
      throw new HttpError(404, "NOT_FOUND", "Workspace was not found.");
    }
    const reports = await service.list(user.id, workspaceId);
    response.status(200).json(ReportListSchema.parse(reports));
  });

  router.get(
    "/:workspaceId/reports/:reportId",
    authorizeWorkspace,
    async (request, response) => {
      const user = request.authUser;
      const { workspaceId, reportId } = request.params;
      if (!user || typeof workspaceId !== "string") {
        throw new HttpError(404, "NOT_FOUND", "Workspace was not found.");
      }
      if (typeof reportId !== "string" || !UuidSchema.safeParse(reportId).success) {
        throw new HttpError(404, "NOT_FOUND", "Report was not found.");
      }
      const report = await service.get(user.id, workspaceId, reportId);
      if (!report) throw new HttpError(404, "NOT_FOUND", "Report was not found.");
      response.status(200).json(ReportSchema.parse(report));
    },
  );

  return router;
}

import { Router, type RequestHandler } from "express";
import type { Router as ExpressRouter } from "express";
import {
  ApprovalDecisionRequestSchema,
  ApprovalDetailSchema,
  ApprovalListSchema,
  ApprovalSchema,
  UuidSchema,
} from "@flowpilot/shared";
import { HttpError } from "../../errors/api-error.js";
import { createWorkspaceAuthorization } from "../../middleware/workspace.js";
import type { ApprovalService, WorkspaceService } from "../../services/contracts.js";
import { parseInput } from "../../validation.js";

export function createApprovalRouter(
  service: ApprovalService,
  workspaces: WorkspaceService,
  authenticate: RequestHandler,
): ExpressRouter {
  const router = Router();
  router.use(authenticate);
  const authorizeWorkspace = createWorkspaceAuthorization(({ userId, workspaceId }) =>
    workspaces.verifyOwner(userId, workspaceId),
  );

  router.get(
    "/:workspaceId/approvals",
    authorizeWorkspace,
    async (request, response) => {
      const user = request.authUser;
      const workspaceId = request.params.workspaceId;
      if (!user || typeof workspaceId !== "string") {
        throw new HttpError(404, "NOT_FOUND", "Workspace was not found.");
      }
      const status = request.query.status;
      if (status !== undefined && typeof status !== "string") {
        throw new HttpError(422, "INVALID_INPUT", "Approval status is invalid.");
      }
      const approvals = await service.list(
        user.id,
        workspaceId,
        typeof status === "string" ? status : undefined,
      );
      response.status(200).json(ApprovalListSchema.parse(approvals));
    },
  );

  router.get(
    "/:workspaceId/approvals/:approvalId",
    authorizeWorkspace,
    async (request, response) => {
      const user = request.authUser;
      const { workspaceId, approvalId } = request.params;
      if (!user || typeof workspaceId !== "string") {
        throw new HttpError(404, "NOT_FOUND", "Workspace was not found.");
      }
      if (typeof approvalId !== "string" || !UuidSchema.safeParse(approvalId).success) {
        throw new HttpError(404, "NOT_FOUND", "Approval was not found.");
      }
      const approval = await service.get(user.id, workspaceId, approvalId);
      if (!approval) throw new HttpError(404, "NOT_FOUND", "Approval was not found.");
      response.status(200).json(ApprovalDetailSchema.parse(approval));
    },
  );

  router.post(
    "/:workspaceId/approvals/:approvalId/decision",
    authorizeWorkspace,
    async (request, response) => {
      const user = request.authUser;
      const { workspaceId, approvalId } = request.params;
      if (!user || typeof workspaceId !== "string") {
        throw new HttpError(404, "NOT_FOUND", "Workspace was not found.");
      }
      if (typeof approvalId !== "string" || !UuidSchema.safeParse(approvalId).success) {
        throw new HttpError(404, "NOT_FOUND", "Approval was not found.");
      }
      const input = parseInput(ApprovalDecisionRequestSchema, request.body);
      const approval = await service.decide(user.id, workspaceId, approvalId, input);
      response.status(200).json(ApprovalSchema.parse(approval));
    },
  );

  return router;
}

import { Router, type RequestHandler } from "express";
import type { Router as ExpressRouter } from "express";
import {
  ExecutionSchema,
  StartExecutionRequestSchema,
  UuidSchema,
} from "@flowpilot/shared";
import { HttpError } from "../../errors/api-error.js";
import { createWorkspaceAuthorization } from "../../middleware/workspace.js";
import type {
  ExecutionService,
  WorkspaceService,
} from "../../services/contracts.js";
import { parseInput } from "../../validation.js";

export function createExecutionRouter(
  service: ExecutionService,
  workspaces: WorkspaceService,
  authenticate: RequestHandler,
): ExpressRouter {
  const router = Router();
  router.use(authenticate);
  router.post(
    "/:workspaceId/workflows/:workflowId/executions",
    createWorkspaceAuthorization(({ userId, workspaceId }) =>
      workspaces.verifyOwner(userId, workspaceId),
    ),
    async (request, response) => {
      const user = request.authUser;
      const { workspaceId, workflowId } = request.params;
      const idempotencyKey = request.get("idempotency-key");
      if (
        !user ||
        typeof workspaceId !== "string" ||
        typeof workflowId !== "string" ||
        !UuidSchema.safeParse(workflowId).success
      ) {
        throw new HttpError(404, "NOT_FOUND", "Workflow was not found.");
      }
      if (!idempotencyKey) {
        throw new HttpError(422, "INVALID_INPUT", "Idempotency-Key is required.");
      }
      const input = parseInput(StartExecutionRequestSchema, request.body);
      const execution = await service.start(
        user.id,
        workspaceId,
        workflowId,
        idempotencyKey,
        input,
      );
      response.status(202).json(ExecutionSchema.parse(execution));
    },
  );
  return router;
}

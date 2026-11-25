import { Router, type RequestHandler } from "express";
import type { Router as ExpressRouter } from "express";
import {
  ExecutionSchema,
  ExecutionDetailSchema,
  ExecutionListSchema,
  RetryExecutionRequestSchema,
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
  const authorizeWorkspace = createWorkspaceAuthorization(({ userId, workspaceId }) =>
    workspaces.verifyOwner(userId, workspaceId),
  );
  router.get("/:workspaceId/executions", authorizeWorkspace, async (request, response) => {
    const user = request.authUser;
    const workspaceId = request.params.workspaceId;
    if (!user || typeof workspaceId !== "string") {
      throw new HttpError(404, "NOT_FOUND", "Workspace was not found.");
    }
    const executions = await service.list(user.id, workspaceId);
    response.status(200).json(ExecutionListSchema.parse(executions));
  });
  router.get(
    "/:workspaceId/executions/:executionId",
    authorizeWorkspace,
    async (request, response) => {
      const user = request.authUser;
      const { workspaceId, executionId } = request.params;
      if (!user || typeof workspaceId !== "string") {
        throw new HttpError(404, "NOT_FOUND", "Workspace was not found.");
      }
      if (typeof executionId !== "string" || !UuidSchema.safeParse(executionId).success) {
        throw new HttpError(404, "NOT_FOUND", "Execution was not found.");
      }
      const execution = await service.get(user.id, workspaceId, executionId);
      if (!execution) throw new HttpError(404, "NOT_FOUND", "Execution was not found.");
      response.status(200).json(ExecutionDetailSchema.parse(execution));
    },
  );
  router.post(
    "/:workspaceId/executions/:executionId/retry",
    authorizeWorkspace,
    async (request, response) => {
      const user = request.authUser;
      const { workspaceId, executionId } = request.params;
      if (!user || typeof workspaceId !== "string") {
        throw new HttpError(404, "NOT_FOUND", "Workspace was not found.");
      }
      if (typeof executionId !== "string" || !UuidSchema.safeParse(executionId).success) {
        throw new HttpError(404, "NOT_FOUND", "Execution was not found.");
      }
      const input = parseInput(RetryExecutionRequestSchema, request.body);
      const execution = await service.retry(
        user.id,
        workspaceId,
        executionId,
        input,
      );
      response.status(202).json(ExecutionSchema.parse(execution));
    },
  );
  router.post(
    "/:workspaceId/workflows/:workflowId/executions",
    authorizeWorkspace,
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

import { Router, type RequestHandler } from "express";
import type { Router as ExpressRouter } from "express";
import {
  SaveWorkflowRequestSchema,
  WorkflowListSchema,
  WorkflowProposalRequestSchema,
  WorkflowProposalSchema,
  WorkflowSchema,
  UuidSchema,
} from "@flowpilot/shared";
import { HttpError } from "../../errors/api-error.js";
import { createWorkspaceAuthorization } from "../../middleware/workspace.js";
import type {
  WorkflowService,
  WorkspaceService,
} from "../../services/contracts.js";
import { parseInput } from "../../validation.js";

function parseWorkflowId(value: string | string[] | undefined): string {
  if (typeof value !== "string" || !UuidSchema.safeParse(value).success) {
    throw new HttpError(404, "NOT_FOUND", "Workflow was not found.");
  }
  return value;
}

function parseExpectedRevision(value: string | undefined): number {
  const match = value?.match(/^"workflow-(\d+)"$/);
  const revision = match?.[1] ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new HttpError(422, "INVALID_INPUT", "A valid If-Match revision is required.");
  }
  return revision;
}

export function createWorkflowRouter(
  service: WorkflowService,
  workspaces: WorkspaceService,
  authenticate: RequestHandler,
): ExpressRouter {
  const router = Router();
  router.use(authenticate);
  const authorizeWorkspace = createWorkspaceAuthorization(({ userId, workspaceId }) =>
    workspaces.verifyOwner(userId, workspaceId),
  );

  router.post(
    "/:workspaceId/workflow-proposals",
    authorizeWorkspace,
    async (request, response) => {
      const user = request.authUser;
      const workspaceId = request.params.workspaceId;
      if (!user || typeof workspaceId !== "string") {
        throw new HttpError(404, "NOT_FOUND", "Workspace was not found.");
      }
      const input = parseInput(WorkflowProposalRequestSchema, request.body);
      const proposal = await service.propose(user.id, workspaceId, input);
      response.status(200).json(WorkflowProposalSchema.parse(proposal));
    },
  );

  router.get("/:workspaceId/workflows", authorizeWorkspace, async (request, response) => {
    const user = request.authUser;
    const workspaceId = request.params.workspaceId;
    if (!user || typeof workspaceId !== "string") {
      throw new HttpError(404, "NOT_FOUND", "Workspace was not found.");
    }
    const workflows = await service.list(user.id, workspaceId);
    response.status(200).json(WorkflowListSchema.parse(workflows));
  });

  router.post("/:workspaceId/workflows", authorizeWorkspace, async (request, response) => {
    const user = request.authUser;
    const workspaceId = request.params.workspaceId;
    if (!user || typeof workspaceId !== "string") {
      throw new HttpError(404, "NOT_FOUND", "Workspace was not found.");
    }
    const input = parseInput(SaveWorkflowRequestSchema, request.body);
    const workflow = await service.create(user.id, workspaceId, input);
    response.status(201).json(WorkflowSchema.parse(workflow));
  });

  router.get(
    "/:workspaceId/workflows/:workflowId",
    authorizeWorkspace,
    async (request, response) => {
      const user = request.authUser;
      const workspaceId = request.params.workspaceId;
      if (!user || typeof workspaceId !== "string") {
        throw new HttpError(404, "NOT_FOUND", "Workspace was not found.");
      }
      const workflowId = parseWorkflowId(request.params.workflowId);
      const workflow = await service.get(user.id, workspaceId, workflowId);
      if (!workflow) throw new HttpError(404, "NOT_FOUND", "Workflow was not found.");
      response.status(200).json(WorkflowSchema.parse(workflow));
    },
  );

  router.put(
    "/:workspaceId/workflows/:workflowId",
    authorizeWorkspace,
    async (request, response) => {
      const user = request.authUser;
      const workspaceId = request.params.workspaceId;
      if (!user || typeof workspaceId !== "string") {
        throw new HttpError(404, "NOT_FOUND", "Workspace was not found.");
      }
      const workflowId = parseWorkflowId(request.params.workflowId);
      const expectedRevision = parseExpectedRevision(request.get("if-match"));
      const input = parseInput(SaveWorkflowRequestSchema, request.body);
      const workflow = await service.update(
        user.id,
        workspaceId,
        workflowId,
        expectedRevision,
        input,
      );
      response.status(200).json(WorkflowSchema.parse(workflow));
    },
  );

  return router;
}

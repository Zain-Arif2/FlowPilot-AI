import { Router, type RequestHandler } from "express";
import type { Router as ExpressRouter } from "express";
import {
  CreateWorkspaceRequestSchema,
  WorkspaceSchema,
} from "@flowpilot/shared";
import { HttpError } from "../../errors/api-error.js";
import type { WorkspaceService } from "../../services/contracts.js";
import { parseInput } from "../../validation.js";
import { createWorkspaceAuthorization } from "../../middleware/workspace.js";

export function createWorkspaceRouter(
  service: WorkspaceService,
  authenticate: RequestHandler,
): ExpressRouter {
  const router = Router();
  router.use(authenticate);

  router.get("/", async (request, response) => {
    const user = request.authUser;
    if (!user) throw new HttpError(401, "UNAUTHENTICATED", "Sign-in is required.");
    const workspaces = await service.list(user.id);
    response.status(200).json(workspaces.map((workspace) => WorkspaceSchema.parse(workspace)));
  });

  router.post("/", async (request, response) => {
    const user = request.authUser;
    if (!user) throw new HttpError(401, "UNAUTHENTICATED", "Sign-in is required.");
    const input = parseInput(CreateWorkspaceRequestSchema, request.body);
    const workspace = await service.create(user.id, input.name);
    response.status(201).json(WorkspaceSchema.parse(workspace));
  });

  router.patch(
    "/:workspaceId",
    createWorkspaceAuthorization(({ userId, workspaceId }) =>
      service.verifyOwner(userId, workspaceId),
    ),
    async (request, response) => {
      const user = request.authUser;
      const workspaceId = request.params.workspaceId;
      if (!user) throw new HttpError(401, "UNAUTHENTICATED", "Sign-in is required.");
      if (typeof workspaceId !== "string") {
        throw new HttpError(404, "NOT_FOUND", "Workspace was not found.");
      }
      const input = parseInput(CreateWorkspaceRequestSchema, request.body);
      const workspace = await service.rename(user.id, workspaceId, input.name);
      if (!workspace) throw new HttpError(404, "NOT_FOUND", "Workspace was not found.");
      response.status(200).json(WorkspaceSchema.parse(workspace));
    },
  );

  return router;
}

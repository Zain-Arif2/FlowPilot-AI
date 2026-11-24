import {
  CreateWorkspaceRequestSchema,
  WorkspaceSchema,
  type Workspace,
} from "@flowpilot/shared";
import type { WorkspaceRepository } from "@flowpilot/db/repositories";
import type { WorkspaceService } from "../../services/contracts.js";

function toWorkspace(value: {
  id: string;
  ownerId: string;
  name: string;
  createdAt: Date;
}): Workspace {
  return WorkspaceSchema.parse({
    id: value.id,
    ownerId: value.ownerId,
    name: value.name,
    createdAt: value.createdAt.toISOString(),
  });
}

export function createWorkspaceService(
  repository: WorkspaceRepository,
): WorkspaceService {
  return {
    async list(userId) {
      const workspaces = await repository.listOwned(userId);
      return workspaces.map(toWorkspace);
    },

    async create(userId, name) {
      const input = CreateWorkspaceRequestSchema.parse({ name });
      return toWorkspace(await repository.createOwned(userId, input.name));
    },

    async rename(userId, workspaceId, name) {
      const input = CreateWorkspaceRequestSchema.parse({ name });
      const workspace = await repository.renameOwned(userId, workspaceId, input.name);
      return workspace ? toWorkspace(workspace) : null;
    },

    verifyOwner(userId, workspaceId) {
      return repository.isOwner(userId, workspaceId);
    },
  };
}

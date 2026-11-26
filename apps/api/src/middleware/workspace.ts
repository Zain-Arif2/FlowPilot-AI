import type { RequestHandler } from "express";
import {
  TenantAccessError,
  withVerifiedWorkspaceOwner,
  withTenantTransaction,
} from "@flowpilot/db/tenant-transaction";
import type { PrismaClient } from "@flowpilot/db";
import { recordRequestTiming } from "@flowpilot/db";
import { HttpError } from "../errors/api-error.js";
import { UuidSchema } from "@flowpilot/shared";

export interface WorkspaceAccess {
  readonly userId: string;
  readonly workspaceId: string;
}

export type WorkspaceVerifier = (context: WorkspaceAccess) => Promise<boolean>;

export function createWorkspaceAuthorization(
  verifyWorkspace: WorkspaceVerifier,
): RequestHandler {
  return async (request, _response, next) => {
    const user = request.authUser;
    const workspaceId = request.params.workspaceId;
    if (!user) {
      next(new HttpError(401, "UNAUTHENTICATED", "Sign-in is required."));
      return;
    }
    if (typeof workspaceId !== "string") {
      next(new HttpError(404, "NOT_FOUND", "Workspace was not found."));
      return;
    }
    if (!UuidSchema.safeParse(workspaceId).success) {
      next(new HttpError(404, "NOT_FOUND", "Workspace was not found."));
      return;
    }

    const context = { userId: user.id, workspaceId };
    const startedAt = performance.now();
    let authorized: boolean;
    try {
      authorized = await verifyWorkspace(context);
    } finally {
      recordRequestTiming(
        "tenantAuthDurationMs",
        performance.now() - startedAt,
      );
    }
    if (!authorized) {
      next(new HttpError(404, "NOT_FOUND", "Workspace was not found."));
      return;
    }
    request.workspaceContext = context;
    withVerifiedWorkspaceOwner(context, next);
  };
}

export function createPrismaWorkspaceVerifier(client: PrismaClient): WorkspaceVerifier {
  return async (context) => {
    try {
      const workspace = await withTenantTransaction(client, context, (transaction) =>
        transaction.workspace.findFirst({
          where: { id: context.workspaceId, ownerId: context.userId },
          select: { id: true },
        }),
      );
      return workspace !== null;
    } catch (error) {
      if (error instanceof TenantAccessError) return false;
      throw error;
    }
  };
}

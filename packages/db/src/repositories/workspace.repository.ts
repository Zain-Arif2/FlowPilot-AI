import type { PrismaClient } from "@prisma/client";
import {
  TenantAccessError,
  withTenantTransaction,
  withUserTransaction,
} from "../tenant-transaction.js";

export function createWorkspaceRepository(client: PrismaClient) {
  return {
    listOwned(userId: string) {
      return withUserTransaction(client, userId, (transaction) =>
        transaction.workspace.findMany({
          where: { ownerId: userId },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        }),
      );
    },

    createOwned(userId: string, name: string) {
      return withUserTransaction(client, userId, (transaction) =>
        transaction.workspace.create({
          data: { ownerId: userId, name },
        }),
      );
    },

    async renameOwned(userId: string, workspaceId: string, name: string) {
      try {
        return await withTenantTransaction(
          client,
          { userId, workspaceId },
          async (transaction) => {
            const updated = await transaction.workspace.updateMany({
              where: { id: workspaceId, ownerId: userId },
              data: { name },
            });
            if (updated.count !== 1) return null;
            return transaction.workspace.findFirst({
              where: { id: workspaceId, ownerId: userId },
            });
          },
        );
      } catch (error) {
        if (error instanceof TenantAccessError) return null;
        throw error;
      }
    },

    async isOwner(userId: string, workspaceId: string): Promise<boolean> {
      try {
        const workspace = await withTenantTransaction(
          client,
          { userId, workspaceId },
          (transaction) =>
            transaction.workspace.findFirst({
              where: { id: workspaceId, ownerId: userId },
              select: { id: true },
            }),
        );
        return workspace !== null;
      } catch (error) {
        if (error instanceof TenantAccessError) return false;
        throw error;
      }
    },
  };
}

export type WorkspaceRepository = ReturnType<typeof createWorkspaceRepository>;

import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma, PrismaClient } from "@prisma/client";
import { measureDatabaseQuery } from "./query-metrics.js";

export interface TenantContext {
  readonly userId: string;
  readonly workspaceId: string;
}

const verifiedWorkspaceOwner = new AsyncLocalStorage<TenantContext>();

export function withVerifiedWorkspaceOwner<T>(
  context: TenantContext,
  callback: () => T,
): T {
  return verifiedWorkspaceOwner.run(context, callback);
}

function isWorkspaceOwnerVerified(context: TenantContext): boolean {
  const verified = verifiedWorkspaceOwner.getStore();
  return (
    verified?.userId === context.userId &&
    verified.workspaceId === context.workspaceId
  );
}

export class TenantAccessError extends Error {
  constructor() {
    super("The authenticated user cannot access this workspace.");
    this.name = "TenantAccessError";
  }
}

const TENANT_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 20_000,
} as const;

export async function withUserTransaction<T>(
  client: PrismaClient,
  userId: string,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return client.$transaction(async (transaction) => {
    await measureDatabaseQuery(() =>
      transaction.$executeRaw`
        SELECT set_config('app.user_id', ${userId}, true)
      `,
    );
    return operation(transaction);
  }, TENANT_TRANSACTION_OPTIONS);
}

export async function withTenantTransaction<T>(
  client: PrismaClient,
  context: TenantContext,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return client.$transaction(async (transaction) => {
    await measureDatabaseQuery(() =>
      transaction.$executeRaw`
        SELECT
          set_config('app.user_id', ${context.userId}, true),
          set_config('app.workspace_id', ${context.workspaceId}, true)
      `,
    );

    if (!isWorkspaceOwnerVerified(context)) {
      const workspace = await measureDatabaseQuery(() =>
        transaction.workspace.findFirst({
          where: { id: context.workspaceId, ownerId: context.userId },
          select: { id: true },
        }),
      );
      if (!workspace) throw new TenantAccessError();
    }

    return operation(transaction);
  }, TENANT_TRANSACTION_OPTIONS);
}

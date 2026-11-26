import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createWorkspaceRepository } from "../src/repositories/workspace.repository.js";
import {
  TenantAccessError,
  withTenantTransaction,
  withVerifiedWorkspaceOwner,
} from "../src/tenant-transaction.js";

const context = {
  userId: "00000000-0000-4000-8000-000000000001",
  workspaceId: "00000000-0000-4000-8000-000000000002",
};

function createTransactionClient(workspaceExists = true) {
  const setTenantContext = vi.fn(async () => 1);
  const findWorkspace = vi.fn(async () =>
    workspaceExists ? { id: context.workspaceId } : null,
  );
  const fakeTransaction = {
    $executeRaw: setTenantContext,
    workspace: { findFirst: findWorkspace },
  };
  const client = {
    $transaction: async <T>(
      operation: (transaction: typeof fakeTransaction) => Promise<T>,
    ) => operation(fakeTransaction),
  } as unknown as PrismaClient;

  return { client, setTenantContext, findWorkspace };
}

describe("tenant transaction authorization", () => {
  it("keeps checking ownership when no verified request context exists", async () => {
    const { client, setTenantContext, findWorkspace } =
      createTransactionClient(false);

    await expect(
      withTenantTransaction(client, context, async () => "not reached"),
    ).rejects.toBeInstanceOf(TenantAccessError);

    expect(setTenantContext).toHaveBeenCalledOnce();
    expect(findWorkspace).toHaveBeenCalledOnce();
  });

  it("reuses middleware-verified ownership while still setting RLS context", async () => {
    const { client, setTenantContext, findWorkspace } =
      createTransactionClient();

    const result = await withVerifiedWorkspaceOwner(context, () =>
      withTenantTransaction(client, context, async () => "authorized"),
    );

    expect(result).toBe("authorized");
    expect(setTenantContext).toHaveBeenCalledOnce();
    expect(findWorkspace).not.toHaveBeenCalled();
  });

  it("does not repeat the workspace lookup in the owner verifier", async () => {
    const { client, findWorkspace } = createTransactionClient();

    await expect(
      createWorkspaceRepository(client).isOwner(
        context.userId,
        context.workspaceId,
      ),
    ).resolves.toBe(true);

    expect(findWorkspace).toHaveBeenCalledOnce();
  });
});

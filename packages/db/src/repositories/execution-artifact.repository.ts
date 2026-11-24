import type { PrismaClient } from "@prisma/client";
import type { TenantContext } from "../tenant-transaction.js";
import { withTenantTransaction } from "../tenant-transaction.js";

export function createExecutionArtifactRepository(client: PrismaClient) {
  return {
    findForStep(context: TenantContext, executionStepId: string) {
      return withTenantTransaction(client, context, (transaction) =>
        transaction.executionArtifact.findFirst({
          where: {
            workspaceId: context.workspaceId,
            executionStepId,
          },
        }),
      );
    },

    persistReference(
      context: TenantContext,
      input: {
        readonly executionId: string;
        readonly executionStepId: string;
        readonly sourceDocumentId: string | null;
        readonly objectKey: string;
      },
    ) {
      return withTenantTransaction(client, context, (transaction) =>
        transaction.executionArtifact.upsert({
          where: {
            workspaceId_executionStepId: {
              workspaceId: context.workspaceId,
              executionStepId: input.executionStepId,
            },
          },
          create: {
            workspaceId: context.workspaceId,
            ...input,
          },
          update: {
            objectKey: input.objectKey,
            sourceDocumentId: input.sourceDocumentId,
          },
        }),
      );
    },

    listForExecution(context: TenantContext, executionId: string) {
      return withTenantTransaction(client, context, (transaction) =>
        transaction.executionArtifact.findMany({
          where: { workspaceId: context.workspaceId, executionId },
        }),
      );
    },

    deleteForExecution(context: TenantContext, executionId: string) {
      return withTenantTransaction(client, context, (transaction) =>
        transaction.executionArtifact.deleteMany({
          where: { workspaceId: context.workspaceId, executionId },
        }),
      );
    },
  };
}

export type ExecutionArtifactRepository = ReturnType<
  typeof createExecutionArtifactRepository
>;

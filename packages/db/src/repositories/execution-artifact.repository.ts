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
        readonly asset: {
          readonly publicId: string;
          readonly resourceType: string;
          readonly deliveryType: string;
          readonly format: string;
        };
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
            executionId: input.executionId,
            executionStepId: input.executionStepId,
            sourceDocumentId: input.sourceDocumentId,
            publicId: input.asset.publicId,
            resourceType: input.asset.resourceType,
            deliveryType: input.asset.deliveryType,
            format: input.asset.format,
          },
          update: {
            publicId: input.asset.publicId,
            resourceType: input.asset.resourceType,
            deliveryType: input.asset.deliveryType,
            format: input.asset.format,
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

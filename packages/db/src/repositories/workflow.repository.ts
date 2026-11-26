import type { Prisma, PrismaClient } from "@prisma/client";
import type { TenantContext } from "../tenant-transaction.js";
import { withTenantTransaction } from "../tenant-transaction.js";
import { measureDatabaseQuery } from "../query-metrics.js";

export function createWorkflowRepository(client: PrismaClient) {
  return {
    list(context: TenantContext) {
      return withTenantTransaction(client, context, (transaction) =>
        measureDatabaseQuery(() =>
          transaction.workflow.findMany({
            where: { workspaceId: context.workspaceId, status: "active" },
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          }),
        ),
      );
    },

    findById(context: TenantContext, workflowId: string) {
      return withTenantTransaction(client, context, (transaction) =>
        transaction.workflow.findFirst({
          where: { id: workflowId, workspaceId: context.workspaceId },
        }),
      );
    },

    create(
      context: TenantContext,
      input: {
        readonly name: string;
        readonly definitionVersion: number;
        readonly definition: Prisma.InputJsonValue;
      },
    ) {
      return withTenantTransaction(client, context, (transaction) =>
        transaction.workflow.create({
          data: {
            workspaceId: context.workspaceId,
            name: input.name,
            definitionVersion: input.definitionVersion,
            definition: input.definition,
          },
        }),
      );
    },

    async update(
      context: TenantContext,
      workflowId: string,
      expectedRevision: number,
      input: {
        readonly name: string;
        readonly definitionVersion: number;
        readonly definition: Prisma.InputJsonValue;
      },
    ) {
      return withTenantTransaction(client, context, async (transaction) => {
        const updated = await transaction.workflow.updateMany({
          where: {
            id: workflowId,
            workspaceId: context.workspaceId,
            revision: expectedRevision,
            status: "active",
          },
          data: {
            name: input.name,
            revision: { increment: 1 },
            definitionVersion: input.definitionVersion,
            definition: input.definition,
          },
        });
        if (updated.count !== 1) return null;
        return transaction.workflow.findFirst({
          where: { id: workflowId, workspaceId: context.workspaceId },
        });
      });
    },
  };
}

export type WorkflowRepository = ReturnType<typeof createWorkflowRepository>;

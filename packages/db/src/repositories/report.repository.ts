import type { Prisma, PrismaClient } from "@prisma/client";
import type { TenantContext } from "../tenant-transaction.js";
import { withTenantTransaction } from "../tenant-transaction.js";

export function createReportRepository(client: PrismaClient) {
  return {
    list(context: TenantContext) {
      return withTenantTransaction(client, context, (transaction) =>
        transaction.report.findMany({
          where: { workspaceId: context.workspaceId },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        }),
      );
    },

    findById(context: TenantContext, reportId: string) {
      return withTenantTransaction(client, context, (transaction) =>
        transaction.report.findFirst({
          where: { id: reportId, workspaceId: context.workspaceId },
        }),
      );
    },

    create(
      context: TenantContext,
      input: {
        readonly sourceDocumentId: string;
        readonly sourceExecutionId: string;
        readonly title: string;
        readonly content: Prisma.InputJsonValue;
      },
    ) {
      return withTenantTransaction(client, context, (transaction) =>
        transaction.report.upsert({
          where: {
            workspaceId_sourceExecutionId: {
              workspaceId: context.workspaceId,
              sourceExecutionId: input.sourceExecutionId,
            },
          },
          create: {
            workspaceId: context.workspaceId,
            ...input,
          },
          update: {},
        }),
      );
    },
  };
}

export type ReportRepository = ReturnType<typeof createReportRepository>;

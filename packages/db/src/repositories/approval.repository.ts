import { Prisma, type ApprovalStatus, type PrismaClient } from "@prisma/client";
import { ReportContentSchema } from "@flowpilot/shared";
import type { TenantContext } from "../tenant-transaction.js";
import { withTenantTransaction } from "../tenant-transaction.js";

export class ApprovalDecisionError extends Error {
  constructor(readonly reason: "NOT_FOUND" | "NOT_PENDING") {
    super(reason);
    this.name = "ApprovalDecisionError";
  }
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function createApprovalRepository(client: PrismaClient) {
  return {
    list(context: TenantContext, status?: ApprovalStatus) {
      return withTenantTransaction(client, context, (transaction) =>
        transaction.approval.findMany({
          where: {
            workspaceId: context.workspaceId,
            ...(status ? { status } : {}),
          },
          select: {
            id: true,
            workspaceId: true,
            executionId: true,
            actionType: true,
            targetReportId: true,
            expectedReportRevision: true,
            status: true,
            requestedAt: true,
            decidedAt: true,
          },
          orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
        }),
      );
    },

    findById(context: TenantContext, approvalId: string) {
      return withTenantTransaction(client, context, (transaction) =>
        transaction.approval.findFirst({
          where: {
            id: approvalId,
            workspaceId: context.workspaceId,
          },
          include: {
            pendingReport: { select: { proposedContent: true } },
          },
        }),
      );
    },

    async decide(
      context: TenantContext,
      input: {
        readonly approvalId: string;
        readonly decision: "approved" | "rejected";
      },
    ) {
      return withTenantTransaction(client, context, async (transaction) => {
        const approval = await transaction.approval.findFirst({
          where: {
            id: input.approvalId,
            workspaceId: context.workspaceId,
          },
          include: {
            pendingReport: true,
            execution: { select: { status: true } },
            executionStep: { select: { status: true } },
          },
        });
        if (!approval) throw new ApprovalDecisionError("NOT_FOUND");
        if (
          approval.status !== "pending" ||
          approval.execution.status !== "waiting_approval" ||
          approval.executionStep.status !== "waiting_approval" ||
          !approval.pendingReport
        ) {
          throw new ApprovalDecisionError("NOT_PENDING");
        }

        const now = new Date();
        const nextStatus = input.decision === "rejected" ? "rejected" : "approved";
        const claimed = await transaction.approval.updateMany({
          where: {
            id: approval.id,
            workspaceId: context.workspaceId,
            status: "pending",
          },
          data: {
            status: nextStatus,
            decidedAt: now,
            decidedById: context.userId,
          },
        });
        if (claimed.count !== 1) throw new ApprovalDecisionError("NOT_PENDING");

        const markCancelled = async (reason: "rejected" | "stale_revision") => {
          const cancelledApproval = await transaction.approval.updateMany({
            where: {
              id: approval.id,
              workspaceId: context.workspaceId,
              status: nextStatus,
            },
            data: { status: reason === "rejected" ? "rejected" : "cancelled" },
          });
          if (cancelledApproval.count !== 1) {
            throw new ApprovalDecisionError("NOT_PENDING");
          }
          const execution = await transaction.execution.updateMany({
            where: {
              id: approval.executionId,
              workspaceId: context.workspaceId,
              status: "waiting_approval",
            },
            data: {
              status: "cancelled",
              finishedAt: now,
              ...(reason === "stale_revision"
                ? { errorCode: "STALE_REPORT_REVISION" }
                : {}),
            },
          });
          const step = await transaction.executionStep.updateMany({
            where: {
              id: approval.executionStepId,
              workspaceId: context.workspaceId,
              status: "waiting_approval",
            },
            data: { status: "skipped" },
          });
          if (execution.count !== 1 || step.count !== 1) {
            throw new ApprovalDecisionError("NOT_PENDING");
          }
          await transaction.pendingReport.delete({
            where: {
              workspaceId_approvalId: {
                workspaceId: context.workspaceId,
                approvalId: approval.id,
              },
            },
          });
          await transaction.executionEvent.createMany({
            data: [
              {
                workspaceId: context.workspaceId,
                executionId: approval.executionId,
                executionStepId: approval.executionStepId,
                eventType:
                  reason === "rejected" ? "approval.rejected" : "approval.stale",
                safeDetails: { state: reason },
              },
              {
                workspaceId: context.workspaceId,
                executionId: approval.executionId,
                eventType: "execution.state_changed",
                safeDetails: {
                  state: "cancelled",
                  ...(reason === "stale_revision"
                    ? { errorCode: "STALE_REPORT_REVISION" }
                    : {}),
                },
              },
            ],
          });
          await transaction.outboxEvent.create({
            data: {
              eventKey: `execution.artifact.cleanup:${approval.executionId}:${approval.id}`,
              eventType: "execution.artifact.cleanup",
              aggregateId: approval.executionId,
              payload: {
                workspaceId: context.workspaceId,
                userId: context.userId,
                aggregateId: approval.executionId,
              },
            },
          });
        };

        if (input.decision === "rejected") {
          await markCancelled("rejected");
        } else {
          const pending = approval.pendingReport;
          if (
            pending.reportId !== approval.targetReportId ||
            pending.expectedReportRevision !== approval.expectedReportRevision
          ) {
            await markCancelled("stale_revision");
            return { kind: "stale" as const };
          }
          const proposedContent = ReportContentSchema.safeParse(
            pending.proposedContent,
          );
          if (!proposedContent.success) {
            throw new TypeError("Pending approval content failed validation.");
          }
          const reportUpdated = await transaction.report.updateMany({
            where: {
              id: approval.targetReportId,
              workspaceId: context.workspaceId,
              revision: approval.expectedReportRevision,
            },
            data: {
              content: toJsonValue(proposedContent.data),
              revision: { increment: 1 },
            },
          });
          if (reportUpdated.count !== 1) {
            await markCancelled("stale_revision");
            return { kind: "stale" as const };
          }

          await transaction.pendingReport.delete({
            where: {
              workspaceId_approvalId: {
                workspaceId: context.workspaceId,
                approvalId: approval.id,
              },
            },
          });
          const execution = await transaction.execution.updateMany({
            where: {
              id: approval.executionId,
              workspaceId: context.workspaceId,
              status: "waiting_approval",
            },
            data: { status: "running" },
          });
          const step = await transaction.executionStep.updateMany({
            where: {
              id: approval.executionStepId,
              workspaceId: context.workspaceId,
              status: "waiting_approval",
            },
            data: { status: "succeeded" },
          });
          if (step.count !== 1 || execution.count !== 1) {
            throw new ApprovalDecisionError("NOT_PENDING");
          }
          await transaction.executionEvent.createMany({
            data: [
              {
                workspaceId: context.workspaceId,
                executionId: approval.executionId,
                executionStepId: approval.executionStepId,
                eventType: "approval.approved",
                safeDetails: { state: "approved" },
              },
              {
                workspaceId: context.workspaceId,
                executionId: approval.executionId,
                eventType: "execution.state_changed",
                safeDetails: { state: "running" },
              },
            ],
          });
          await transaction.outboxEvent.create({
            data: {
              eventKey: `execution.continue:${approval.executionId}:${approval.id}`,
              eventType: "execution.continue",
              aggregateId: approval.executionId,
              payload: {
                workspaceId: context.workspaceId,
                userId: context.userId,
                aggregateId: approval.executionId,
              },
            },
          });
        }

        return {
          kind: "decided" as const,
          approval: await transaction.approval.findFirstOrThrow({
            where: {
              id: approval.id,
              workspaceId: context.workspaceId,
            },
            select: {
              id: true,
              workspaceId: true,
              executionId: true,
              actionType: true,
              targetReportId: true,
              expectedReportRevision: true,
              status: true,
              requestedAt: true,
              decidedAt: true,
            },
          }),
        };
      });
    },
  };
}

export type ApprovalRepository = ReturnType<typeof createApprovalRepository>;

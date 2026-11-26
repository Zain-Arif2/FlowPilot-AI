import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@flowpilot/db/client";
import type { TenantContext } from "../tenant-transaction.js";
import { withTenantTransaction } from "../tenant-transaction.js";
import { measureDatabaseQuery } from "../query-metrics.js";

const RETRYABLE_ERROR_CODES = new Set([
  "AI_PROVIDER_UNAVAILABLE",
  "AI_PROVIDER_RATE_LIMITED",
  "DEPENDENCY_UNAVAILABLE",
]);
const RETRYABLE_ACTION_TYPES = new Set([
  "extract_document",
  "analyze_document",
  "condition",
]);
const MAX_ATTEMPTS = 5;

export function isManualRetryEligible(input: {
  readonly actionType: string;
  readonly attemptNumber: number;
  readonly errorCode: string | null;
  readonly status: string;
}): boolean {
  return (
    input.status === "failed" &&
    RETRYABLE_ACTION_TYPES.has(input.actionType) &&
    input.errorCode !== null &&
    RETRYABLE_ERROR_CODES.has(input.errorCode) &&
    input.attemptNumber < MAX_ATTEMPTS
  );
}

export class ExecutionHistoryError extends Error {
  constructor(readonly reason: "NOT_FOUND" | "RETRY_NOT_ALLOWED") {
    super(reason);
    this.name = "ExecutionHistoryError";
  }
}

export function createExecutionHistoryRepository(client: PrismaClient) {
  return {
    list(context: TenantContext) {
      return withTenantTransaction(client, context, (transaction) =>
        measureDatabaseQuery(() =>
          transaction.execution.findMany({
            where: { workspaceId: context.workspaceId },
            orderBy: { createdAt: "desc" },
            take: 100,
            select: {
              id: true,
              workflowId: true,
              status: true,
              createdAt: true,
              errorCode: true,
            },
          }),
        ),
      );
    },

    get(context: TenantContext, executionId: string) {
      return withTenantTransaction(client, context, (transaction) =>
        transaction.execution.findFirst({
          where: { id: executionId, workspaceId: context.workspaceId },
          select: {
            id: true,
            workflowId: true,
            status: true,
            createdAt: true,
            errorCode: true,
            steps: {
              orderBy: { createdAt: "asc" },
              select: {
                nodeId: true,
                actionType: true,
                status: true,
                attempts: {
                  orderBy: { attemptNumber: "asc" },
                  select: {
                    attemptNumber: true,
                    status: true,
                    startedAt: true,
                    finishedAt: true,
                    errorCode: true,
                  },
                },
              },
            },
            events: {
              orderBy: { createdAt: "asc" },
              select: {
                eventType: true,
                executionStep: { select: { nodeId: true } },
                safeDetails: true,
                createdAt: true,
              },
            },
          },
        }),
      );
    },

    retryFailedStep(
      context: TenantContext,
      input: { readonly executionId: string; readonly stepId: string },
    ) {
      return withTenantTransaction(client, context, async (transaction) => {
        const execution = await transaction.execution.findFirst({
          where: {
            id: input.executionId,
            workspaceId: context.workspaceId,
            status: "failed",
          },
          select: {
            id: true,
            workflowId: true,
            documentId: true,
            createdAt: true,
          },
        });
        if (!execution) throw new ExecutionHistoryError("NOT_FOUND");

        const step = await transaction.executionStep.findFirst({
          where: {
            workspaceId: context.workspaceId,
            executionId: execution.id,
            nodeId: input.stepId,
            status: "failed",
          },
          select: {
            id: true,
            actionType: true,
            attempts: {
              orderBy: { attemptNumber: "desc" },
              take: 1,
              select: { attemptNumber: true, errorCode: true, status: true },
            },
          },
        });
        const latestAttempt = step?.attempts[0];
        if (
          !step ||
          !latestAttempt ||
          !isManualRetryEligible({
            actionType: step.actionType,
            attemptNumber: latestAttempt.attemptNumber,
            errorCode: latestAttempt.errorCode,
            status: latestAttempt.status,
          })
        ) {
          throw new ExecutionHistoryError("RETRY_NOT_ALLOWED");
        }

        if (execution.documentId) {
          const document = await transaction.document.findFirst({
            where: {
              id: execution.documentId,
              workspaceId: context.workspaceId,
              status: "ready",
            },
            select: { id: true },
          });
          if (!document) throw new ExecutionHistoryError("RETRY_NOT_ALLOWED");
        }

        const updated = await transaction.execution.updateMany({
          where: {
            id: execution.id,
            workspaceId: context.workspaceId,
            status: "failed",
          },
          data: {
            status: "queued",
            finishedAt: null,
            errorCode: null,
            errorMessage: null,
          },
        });
        if (updated.count !== 1) {
          throw new ExecutionHistoryError("RETRY_NOT_ALLOWED");
        }

        await transaction.executionEvent.create({
          data: {
            workspaceId: context.workspaceId,
            executionId: execution.id,
            executionStepId: step.id,
            eventType: "execution.retry_queued",
            safeDetails: {
              state: "queued",
              attemptNumber: latestAttempt.attemptNumber + 1,
            },
          },
        });
        await transaction.outboxEvent.create({
          data: {
            eventKey: `execution.start:${execution.id}:${randomUUID()}`,
            eventType: "execution.start",
            aggregateId: execution.id,
            payload: {
              workspaceId: context.workspaceId,
              userId: context.userId,
              aggregateId: execution.id,
            },
          },
        });

        return transaction.execution.findFirstOrThrow({
          where: { id: execution.id, workspaceId: context.workspaceId },
          select: {
            id: true,
            workflowId: true,
            status: true,
            createdAt: true,
            errorCode: true,
          },
        });
      });
    },
  };
}

export type ExecutionHistoryRepository = ReturnType<
  typeof createExecutionHistoryRepository
>;

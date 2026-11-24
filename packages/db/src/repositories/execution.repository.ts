import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { WorkflowDefinitionSchema, validateWorkflowGraph } from "@flowpilot/shared";
import type { TenantContext } from "../tenant-transaction.js";
import { withTenantTransaction } from "../tenant-transaction.js";

export class ExecutionConflictError extends Error {
  constructor(
    readonly reason:
      | "WORKFLOW_NOT_FOUND"
      | "WORKFLOW_REVISION_STALE"
      | "DOCUMENT_NOT_READY"
      | "IDEMPOTENCY_KEY_REUSED"
      | "WORKFLOW_INVALID",
  ) {
    super(reason);
    this.name = "ExecutionConflictError";
  }
}

export class ExecutionApprovalError extends Error {
  constructor(
    readonly reason: "REPORT_NOT_FOUND" | "DOCUMENT_NOT_READY" | "STEP_NOT_RUNNING",
  ) {
    super(reason);
    this.name = "ExecutionApprovalError";
  }
}

export function createExecutionRepository(client: PrismaClient) {
  const findIdempotent = (context: TenantContext, idempotencyKey: string) =>
    withTenantTransaction(client, context, (transaction) =>
      transaction.execution.findFirst({
        where: {
          workspaceId: context.workspaceId,
          createdById: context.userId,
          idempotencyKey,
        },
        include: { steps: { orderBy: { createdAt: "asc" } } },
      }),
    );

  return {
    async create(
      context: TenantContext,
      input: {
        readonly workflowId: string;
        readonly workflowRevision: number;
        readonly documentId?: string;
        readonly idempotencyKey: string;
      },
    ) {
      try {
        return await withTenantTransaction(client, context, async (transaction) => {
          const existing = await transaction.execution.findFirst({
            where: {
              workspaceId: context.workspaceId,
              createdById: context.userId,
              idempotencyKey: input.idempotencyKey,
            },
            include: { steps: { orderBy: { createdAt: "asc" } } },
          });
          if (existing) {
            if (
              existing.workflowId !== input.workflowId ||
              existing.workflowRevision !== input.workflowRevision ||
              existing.documentId !== (input.documentId ?? null)
            ) {
              throw new ExecutionConflictError("IDEMPOTENCY_KEY_REUSED");
            }
            return existing;
          }

          const workflow = await transaction.workflow.findFirst({
            where: {
              id: input.workflowId,
              workspaceId: context.workspaceId,
              status: "active",
            },
          });
          if (!workflow) throw new ExecutionConflictError("WORKFLOW_NOT_FOUND");
          if (workflow.revision !== input.workflowRevision) {
            throw new ExecutionConflictError("WORKFLOW_REVISION_STALE");
          }
          const parsedDefinition = WorkflowDefinitionSchema.safeParse(
            workflow.definition,
          );
          const validatedDefinition = parsedDefinition.success
            ? validateWorkflowGraph(parsedDefinition.data)
            : { success: false as const };
          if (!validatedDefinition.success) {
            throw new ExecutionConflictError("WORKFLOW_INVALID");
          }

          if (input.documentId) {
            const document = await transaction.document.findFirst({
              where: {
                id: input.documentId,
                workspaceId: context.workspaceId,
                status: "ready",
              },
              select: { id: true },
            });
            if (!document) throw new ExecutionConflictError("DOCUMENT_NOT_READY");
          }

          const execution = await transaction.execution.create({
            data: {
              workspaceId: context.workspaceId,
              workflowId: workflow.id,
              createdById: context.userId,
              documentId: input.documentId ?? null,
              workflowRevision: workflow.revision,
              workflowSnapshot: JSON.parse(
                JSON.stringify(validatedDefinition.data),
              ) as Prisma.InputJsonValue,
              idempotencyKey: input.idempotencyKey,
              status: "queued",
            },
          });
          await transaction.executionStep.createMany({
            data: validatedDefinition.data.nodes.map((node) => ({
              workspaceId: context.workspaceId,
              executionId: execution.id,
              nodeId: node.id,
              actionType: node.kind,
              status: "pending",
            })),
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
          return transaction.execution.findUniqueOrThrow({
            where: { id: execution.id },
            include: { steps: { orderBy: { createdAt: "asc" } } },
          });
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          const existing = await findIdempotent(context, input.idempotencyKey);
          if (existing) {
            if (
              existing.workflowId === input.workflowId &&
              existing.workflowRevision === input.workflowRevision &&
              existing.documentId === (input.documentId ?? null)
            ) {
              return existing;
            }
            throw new ExecutionConflictError("IDEMPOTENCY_KEY_REUSED");
          }
        }
        throw error;
      }
    },

    findForWorker(context: TenantContext, executionId: string) {
      return withTenantTransaction(client, context, (transaction) =>
        transaction.execution.findFirst({
          where: {
            id: executionId,
            workspaceId: context.workspaceId,
          },
          include: {
            steps: {
              orderBy: { createdAt: "asc" },
              include: {
                artifact: true,
                attempts: {
                  orderBy: { attemptNumber: "desc" },
                  take: 1,
                },
              },
            },
          },
        }),
      );
    },

    async startForWorker(context: TenantContext, executionId: string) {
      return withTenantTransaction(client, context, async (transaction) => {
        const execution = await transaction.execution.findFirst({
          where: { id: executionId, workspaceId: context.workspaceId },
          select: { status: true, startedAt: true },
        });
        if (!execution) return false;
        if (execution.status === "running") return true;
        if (execution.status !== "queued") return false;

        const updated = await transaction.execution.updateMany({
          where: {
            id: executionId,
            workspaceId: context.workspaceId,
            status: "queued",
          },
          data: {
            status: "running",
            startedAt: execution.startedAt ?? new Date(),
          },
        });
        if (updated.count !== 1) return false;
        await transaction.executionEvent.create({
          data: {
            workspaceId: context.workspaceId,
            executionId,
            eventType: "execution.state_changed",
            safeDetails: { state: "running" },
          },
        });
        return true;
      });
    },

    async beginStepAttempt(
      context: TenantContext,
      input: { readonly executionId: string; readonly executionStepId: string },
    ) {
      return withTenantTransaction(client, context, async (transaction) => {
        const execution = await transaction.execution.updateMany({
          where: {
            id: input.executionId,
            workspaceId: context.workspaceId,
            status: "running",
          },
          data: { status: "running" },
        });
        if (execution.count !== 1) return null;
        const executionRow = await transaction.execution.findFirst({
          where: { id: input.executionId, workspaceId: context.workspaceId },
          select: { documentId: true },
        });
        if (!executionRow) return null;
        if (executionRow.documentId) {
          const document = await transaction.document.findFirst({
            where: {
              id: executionRow.documentId,
              workspaceId: context.workspaceId,
              status: "ready",
            },
            select: { id: true },
          });
          if (!document) return null;
        }

        const step = await transaction.executionStep.findFirst({
          where: {
            id: input.executionStepId,
            executionId: input.executionId,
            workspaceId: context.workspaceId,
          },
          select: { id: true, status: true },
        });
        if (
          !step ||
          step.status === "succeeded" ||
          step.status === "skipped" ||
          step.status === "waiting_approval"
        ) {
          return null;
        }

        const attempts = await transaction.stepAttempt.findMany({
          where: {
            workspaceId: context.workspaceId,
            executionStepId: step.id,
          },
          orderBy: { attemptNumber: "desc" },
          take: 1,
        });
        const previousAttempt = attempts[0];
        if (previousAttempt?.status === "running") {
          await transaction.stepAttempt.updateMany({
            where: {
              id: previousAttempt.id,
              workspaceId: context.workspaceId,
              status: "running",
            },
            data: {
              status: "failed",
              finishedAt: new Date(),
              errorCode: "WORKER_RESTARTED",
              errorMessage: "The worker restarted during this step.",
            },
          });
        }

        const attemptNumber = (previousAttempt?.attemptNumber ?? 0) + 1;
        const startedStep = await transaction.executionStep.updateMany({
          where: {
            id: step.id,
            executionId: input.executionId,
            workspaceId: context.workspaceId,
            status: step.status,
          },
          data: { status: "running" },
        });
        if (startedStep.count !== 1) {
          throw new Error("The execution step changed before its attempt started.");
        }
        const attempt = await transaction.stepAttempt.create({
          data: {
            workspaceId: context.workspaceId,
            executionStepId: step.id,
            attemptNumber,
            status: "running",
          },
        });
        await transaction.executionEvent.create({
          data: {
            workspaceId: context.workspaceId,
            executionId: input.executionId,
            executionStepId: step.id,
            eventType: "execution_step.attempt_started",
            safeDetails: { state: "running", attemptNumber },
          },
        });
        return { attemptId: attempt.id, attemptNumber };
      });
    },

    async completeStepAttempt(
      context: TenantContext,
      input: {
        readonly executionId: string;
        readonly executionStepId: string;
        readonly attemptId: string;
        readonly sourceDocumentId: string;
        readonly objectKey: string;
        readonly elapsedMs: number;
      },
    ): Promise<boolean> {
      return withTenantTransaction(client, context, async (transaction) => {
        const execution = await transaction.execution.updateMany({
          where: {
            id: input.executionId,
            workspaceId: context.workspaceId,
            status: "running",
            documentId: input.sourceDocumentId,
          },
          data: { status: "running" },
        });
        if (execution.count !== 1) return false;
        const document = await transaction.document.findFirst({
          where: {
            id: input.sourceDocumentId,
            workspaceId: context.workspaceId,
            status: "ready",
          },
          select: { id: true },
        });
        if (!document) return false;
        const attempt = await transaction.stepAttempt.findFirst({
          where: {
            id: input.attemptId,
            workspaceId: context.workspaceId,
            executionStepId: input.executionStepId,
            status: "running",
            executionStep: {
              executionId: input.executionId,
              status: "running",
            },
          },
          select: { id: true, attemptNumber: true },
        });
        if (!attempt) return false;

        await transaction.executionArtifact.upsert({
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
            objectKey: input.objectKey,
          },
          update: {
            objectKey: input.objectKey,
            sourceDocumentId: input.sourceDocumentId,
          },
        });
        await transaction.stepAttempt.update({
          where: { id: attempt.id },
          data: {
            status: "succeeded",
            finishedAt: new Date(),
            errorCode: null,
            errorMessage: null,
          },
        });
        await transaction.executionStep.update({
          where: {
            workspaceId_id: {
              workspaceId: context.workspaceId,
              id: input.executionStepId,
            },
          },
          data: { status: "succeeded" },
        });
        await transaction.executionEvent.create({
          data: {
            workspaceId: context.workspaceId,
            executionId: input.executionId,
            executionStepId: input.executionStepId,
            eventType: "execution_step.state_changed",
            safeDetails: {
              state: "succeeded",
              attemptNumber: attempt.attemptNumber,
              elapsedMs: input.elapsedMs,
            },
          },
        });
        return true;
      });
    },

    async createReportReplacementApproval(
      context: TenantContext,
      input: {
        readonly executionId: string;
        readonly executionStepId: string;
        readonly attemptId: string;
        readonly targetReportId: string;
        readonly sourceDocumentId: string;
        readonly proposedContent: Prisma.InputJsonValue;
        readonly objectKey: string;
      },
    ) {
      return withTenantTransaction(client, context, async (transaction) => {
        const execution = await transaction.execution.updateMany({
          where: {
            id: input.executionId,
            workspaceId: context.workspaceId,
            status: "running",
            documentId: input.sourceDocumentId,
          },
          data: { status: "waiting_approval" },
        });
        if (execution.count !== 1) return null;
        const document = await transaction.document.findFirst({
          where: {
            id: input.sourceDocumentId,
            workspaceId: context.workspaceId,
            status: "ready",
          },
          select: { id: true },
        });
        if (!document) throw new ExecutionApprovalError("DOCUMENT_NOT_READY");

        const report = await transaction.report.findFirst({
          where: {
            id: input.targetReportId,
            workspaceId: context.workspaceId,
          },
          select: { id: true, revision: true },
        });
        if (!report) throw new ExecutionApprovalError("REPORT_NOT_FOUND");
        const attempt = await transaction.stepAttempt.findFirst({
          where: {
            id: input.attemptId,
            workspaceId: context.workspaceId,
            executionStepId: input.executionStepId,
            status: "running",
            executionStep: {
              executionId: input.executionId,
              status: "running",
            },
          },
          select: { id: true, attemptNumber: true },
        });
        if (!attempt) throw new ExecutionApprovalError("STEP_NOT_RUNNING");

        const approval = await transaction.approval.create({
          data: {
            workspaceId: context.workspaceId,
            executionId: input.executionId,
            executionStepId: input.executionStepId,
            actionType: "replace_report",
            targetReportId: report.id,
            expectedReportRevision: report.revision,
            status: "pending",
          },
        });
        await transaction.pendingReport.create({
          data: {
            workspaceId: context.workspaceId,
            approvalId: approval.id,
            reportId: report.id,
            sourceDocumentId: input.sourceDocumentId,
            expectedReportRevision: report.revision,
            proposedContent: input.proposedContent,
          },
        });
        await transaction.executionArtifact.upsert({
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
            objectKey: input.objectKey,
          },
          update: {
            objectKey: input.objectKey,
            sourceDocumentId: input.sourceDocumentId,
          },
        });
        await transaction.stepAttempt.update({
          where: { id: attempt.id },
          data: { status: "succeeded", finishedAt: new Date() },
        });
        const waitingStep = await transaction.executionStep.updateMany({
          where: {
            id: input.executionStepId,
            workspaceId: context.workspaceId,
            executionId: input.executionId,
            status: "running",
          },
          data: { status: "waiting_approval" },
        });
        if (waitingStep.count !== 1) {
          throw new ExecutionApprovalError("STEP_NOT_RUNNING");
        }
        await transaction.executionEvent.create({
          data: {
            workspaceId: context.workspaceId,
            executionId: input.executionId,
            executionStepId: input.executionStepId,
            eventType: "approval.requested",
            safeDetails: {
              state: "pending",
              attemptNumber: attempt.attemptNumber,
            },
          },
        });
        return {
          approvalId: approval.id,
          expectedReportRevision: report.revision,
          targetReportId: report.id,
        };
      });
    },

    async failStepAttempt(
      context: TenantContext,
      input: {
        readonly executionId: string;
        readonly executionStepId: string;
        readonly attemptId: string;
        readonly errorCode: string;
        readonly attemptNumber: number;
      },
    ): Promise<void> {
      if (!/^[A-Z0-9_]{1,64}$/.test(input.errorCode)) {
        throw new TypeError(
          "Execution error codes must be safe uppercase identifiers.",
        );
      }
      await withTenantTransaction(client, context, async (transaction) => {
        const execution = await transaction.execution.updateMany({
          where: {
            id: input.executionId,
            workspaceId: context.workspaceId,
            status: "running",
          },
          data: { status: "running" },
        });
        if (execution.count !== 1) return;
        const attempt = await transaction.stepAttempt.findFirst({
          where: {
            id: input.attemptId,
            workspaceId: context.workspaceId,
            executionStepId: input.executionStepId,
            status: "running",
            executionStep: { executionId: input.executionId },
          },
          select: { id: true },
        });
        if (!attempt) return;
        await transaction.stepAttempt.update({
          where: { id: attempt.id },
          data: {
            status: "failed",
            finishedAt: new Date(),
            errorCode: input.errorCode,
            errorMessage: "The workflow step failed.",
          },
        });
        await transaction.executionStep.updateMany({
          where: {
            id: input.executionStepId,
            executionId: input.executionId,
            workspaceId: context.workspaceId,
            status: "running",
          },
          data: { status: "failed" },
        });
        await transaction.executionEvent.create({
          data: {
            workspaceId: context.workspaceId,
            executionId: input.executionId,
            executionStepId: input.executionStepId,
            eventType: "execution_step.state_changed",
            safeDetails: {
              state: "failed",
              errorCode: input.errorCode,
              attemptNumber: input.attemptNumber,
            },
          },
        });
      });
    },

    async finish(
      context: TenantContext,
      input: {
        readonly executionId: string;
        readonly status: "succeeded" | "failed" | "cancelled";
        readonly errorCode?: string;
      },
    ): Promise<boolean> {
      if (input.errorCode && !/^[A-Z0-9_]{1,64}$/.test(input.errorCode)) {
        throw new TypeError(
          "Execution error codes must be safe uppercase identifiers.",
        );
      }
      return withTenantTransaction(client, context, async (transaction) => {
        const updated = await transaction.execution.updateMany({
          where: {
            id: input.executionId,
            workspaceId: context.workspaceId,
            status: "running",
          },
          data: {
            status: input.status,
            finishedAt: new Date(),
            ...(input.errorCode ? { errorCode: input.errorCode } : {}),
            ...(input.status === "failed"
              ? { errorMessage: "Workflow execution failed." }
              : {}),
          },
        });
        if (updated.count !== 1) return false;
        await transaction.executionEvent.create({
          data: {
            workspaceId: context.workspaceId,
            executionId: input.executionId,
            eventType: "execution.state_changed",
            safeDetails: {
              state: input.status,
              ...(input.errorCode ? { errorCode: input.errorCode } : {}),
            },
          },
        });
        await transaction.outboxEvent.create({
          data: {
            eventKey: `execution.artifact.cleanup:${input.executionId}:${randomUUID()}`,
            eventType: "execution.artifact.cleanup",
            aggregateId: input.executionId,
            payload: {
              workspaceId: context.workspaceId,
              userId: context.userId,
              aggregateId: input.executionId,
            },
          },
        });
        return true;
      });
    },
  };
}

export type ExecutionRepository = ReturnType<typeof createExecutionRepository>;

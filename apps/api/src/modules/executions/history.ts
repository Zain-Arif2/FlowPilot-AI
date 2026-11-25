import {
  ExecutionDetailSchema,
  ExecutionListSchema,
  ExecutionSchema,
  RetryExecutionRequestSchema,
  type ExecutionDetailDto,
  type ExecutionDto,
  type RetryExecutionRequest,
} from "@flowpilot/shared";
import {
  ExecutionHistoryError,
  type ExecutionHistoryRepository,
} from "@flowpilot/db/repositories";
import { HttpError } from "../../errors/api-error.js";
import type { ExecutionService } from "../../services/contracts.js";

function mapHistoryError(error: ExecutionHistoryError): HttpError {
  if (error.reason === "NOT_FOUND") {
    return new HttpError(404, "NOT_FOUND", "Execution was not found.");
  }
  return new HttpError(
    409,
    "CONFLICT",
    "This failed step is not eligible for a safe retry.",
  );
}

function toExecutionDto(execution: {
  readonly id: string;
  readonly workflowId: string;
  readonly status: string;
  readonly createdAt: Date;
  readonly errorCode: string | null;
}): ExecutionDto {
  return ExecutionSchema.parse({
    id: execution.id,
    workflowId: execution.workflowId,
    status: execution.status,
    createdAt: execution.createdAt.toISOString(),
    ...(execution.errorCode ? { errorCode: execution.errorCode } : {}),
  });
}

export function createExecutionHistoryService(
  repository: ExecutionHistoryRepository,
): Pick<ExecutionService, "list" | "get" | "retry"> {
  return {
    async list(userId, workspaceId) {
      try {
        const executions = await repository.list({ userId, workspaceId });
        return ExecutionListSchema.parse(executions.map(toExecutionDto));
      } catch (error) {
        if (error instanceof ExecutionHistoryError) throw mapHistoryError(error);
        throw error;
      }
    },

    async get(userId, workspaceId, executionId): Promise<ExecutionDetailDto | null> {
      const execution = await repository.get(
        { userId, workspaceId },
        executionId,
      );
      if (!execution) return null;

      try {
        return ExecutionDetailSchema.parse({
          id: execution.id,
          workflowId: execution.workflowId,
          status: execution.status,
          createdAt: execution.createdAt.toISOString(),
          ...(execution.errorCode ? { errorCode: execution.errorCode } : {}),
          steps: execution.steps.map((step) => {
            const latestAttempt = step.attempts.at(-1);
            return {
              stepId: step.nodeId,
              actionType: step.actionType,
              status: step.status,
              ...(latestAttempt?.errorCode
                ? { errorCode: latestAttempt.errorCode }
                : {}),
              attempts: step.attempts.map((attempt) => ({
                attemptNumber: attempt.attemptNumber,
                status: attempt.status,
                startedAt: attempt.startedAt.toISOString(),
                ...(attempt.finishedAt
                  ? { finishedAt: attempt.finishedAt.toISOString() }
                  : {}),
                ...(attempt.errorCode ? { errorCode: attempt.errorCode } : {}),
              })),
            };
          }),
          events: execution.events.map((event) => ({
            eventType: event.eventType,
            ...(event.executionStep
              ? { stepId: event.executionStep.nodeId }
              : {}),
            details: event.safeDetails,
            createdAt: event.createdAt.toISOString(),
          })),
        });
      } catch (error) {
        if (error instanceof ExecutionHistoryError) throw mapHistoryError(error);
        throw error;
      }
    },

    async retry(userId, workspaceId, executionId, input: RetryExecutionRequest) {
      const request = RetryExecutionRequestSchema.parse(input);
      try {
        return toExecutionDto(
          await repository.retryFailedStep(
            { userId, workspaceId },
            { executionId, stepId: request.stepId },
          ),
        );
      } catch (error) {
        if (error instanceof ExecutionHistoryError) throw mapHistoryError(error);
        throw error;
      }
    },
  };
}

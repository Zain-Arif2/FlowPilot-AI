import {
  ExecutionConflictError,
  type ExecutionRepository,
} from "@flowpilot/db/repositories";
import {
  ExecutionSchema,
  StartExecutionRequestSchema,
  type ExecutionDto,
  type StartExecutionRequest,
} from "@flowpilot/shared";
import { HttpError } from "../../errors/api-error.js";
import type { ExecutionService } from "../../services/contracts.js";

function mapRepositoryError(error: ExecutionConflictError): HttpError {
  switch (error.reason) {
    case "WORKFLOW_NOT_FOUND":
      return new HttpError(404, "NOT_FOUND", "Workflow was not found.");
    case "WORKFLOW_INVALID":
      return new HttpError(422, "INVALID_INPUT", "Workflow definition failed validation.");
    case "WORKFLOW_REVISION_STALE":
      return new HttpError(409, "CONFLICT", "The workflow revision has changed.");
    case "DOCUMENT_NOT_READY":
      return new HttpError(409, "CONFLICT", "The document is not ready for execution.");
    case "IDEMPOTENCY_KEY_REUSED":
      return new HttpError(409, "CONFLICT", "The idempotency key was already used.");
  }
}

function toExecutionDto(execution: {
  id: string;
  workflowId: string;
  status: string;
  createdAt: Date;
  steps: ReadonlyArray<{ nodeId: string; status: string }>;
}): ExecutionDto {
  return ExecutionSchema.parse({
    id: execution.id,
    workflowId: execution.workflowId,
    status: execution.status,
    createdAt: execution.createdAt.toISOString(),
    steps: execution.steps.map((step) => ({
      stepId: step.nodeId,
      status: step.status,
    })),
  });
}

export function createExecutionService(
  repository: ExecutionRepository,
  history: Pick<ExecutionService, "list" | "get" | "retry">,
): ExecutionService {
  return {
    ...history,
    async start(
      userId,
      workspaceId,
      workflowId,
      idempotencyKey,
      input: StartExecutionRequest,
    ) {
      const request = StartExecutionRequestSchema.parse(input);
      if (idempotencyKey.length < 16 || idempotencyKey.length > 128) {
        throw new HttpError(
          422,
          "INVALID_INPUT",
          "Idempotency-Key must be between 16 and 128 characters.",
        );
      }
      try {
        const execution = await repository.create(
          { userId, workspaceId },
          {
            workflowId,
            workflowRevision: request.workflowRevision,
            ...(request.documentId ? { documentId: request.documentId } : {}),
            idempotencyKey,
          },
        );
        return toExecutionDto(execution);
      } catch (error) {
        if (error instanceof ExecutionConflictError) {
          throw mapRepositoryError(error);
        }
        throw error;
      }
    },
  };
}

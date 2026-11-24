import type {
  WorkflowRepository,
} from "@flowpilot/db/repositories";
import {
  SaveWorkflowRequestSchema,
  WorkflowSchema,
  type SaveWorkflowRequest,
  type WorkflowDto,
} from "@flowpilot/shared";
import { HttpError } from "../../errors/api-error.js";
import type { WorkflowService } from "../../services/contracts.js";
import type { WorkflowProposalService } from "./proposal.js";
import { validateExecutableWorkflow } from "./validate.js";

function toWorkflowDto(workflow: {
  id: string;
  name: string;
  revision: number;
  definition: unknown;
  updatedAt: Date;
}): WorkflowDto {
  return WorkflowSchema.parse({
    id: workflow.id,
    name: workflow.name,
    revision: workflow.revision,
    definition: workflow.definition,
    updatedAt: workflow.updatedAt.toISOString(),
  });
}

function parseSaveRequest(input: SaveWorkflowRequest): SaveWorkflowRequest {
  const request = SaveWorkflowRequestSchema.parse(input);
  return {
    ...request,
    definition: validateExecutableWorkflow(request.definition),
  };
}

export function createWorkflowService(
  repository: WorkflowRepository,
  proposalService: WorkflowProposalService,
): WorkflowService {
  return {
    propose(userId, workspaceId, input) {
      return proposalService.propose(userId, workspaceId, input);
    },

    async list(userId, workspaceId) {
      const workflows = await repository.list({ userId, workspaceId });
      return workflows.map(toWorkflowDto);
    },

    async create(userId, workspaceId, input) {
      const request = parseSaveRequest(input);
      const workflow = await repository.create(
        { userId, workspaceId },
        {
          name: request.name,
          definitionVersion: request.definition.version,
          definition: request.definition,
        },
      );
      return toWorkflowDto(workflow);
    },

    async get(userId, workspaceId, workflowId) {
      const workflow = await repository.findById(
        { userId, workspaceId },
        workflowId,
      );
      return workflow ? toWorkflowDto(workflow) : null;
    },

    async update(userId, workspaceId, workflowId, expectedRevision, input) {
      const request = parseSaveRequest(input);
      const updated = await repository.update(
        { userId, workspaceId },
        workflowId,
        expectedRevision,
        {
          name: request.name,
          definitionVersion: request.definition.version,
          definition: request.definition,
        },
      );
      if (updated) return toWorkflowDto(updated);

      const current = await repository.findById(
        { userId, workspaceId },
        workflowId,
      );
      if (!current) throw new HttpError(404, "NOT_FOUND", "Workflow was not found.");
      throw new HttpError(
        409,
        "CONFLICT",
        "The workflow changed since it was loaded. Reload before saving.",
      );
    },
  };
}

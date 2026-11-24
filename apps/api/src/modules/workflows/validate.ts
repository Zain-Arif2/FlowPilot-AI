import {
  validateWorkflowGraph,
  type WorkflowDefinition,
} from "@flowpilot/shared";
import { HttpError } from "../../errors/api-error.js";

export function validateExecutableWorkflow(input: unknown): WorkflowDefinition {
  const validation = validateWorkflowGraph(input);
  if (!validation.success) {
    throw new HttpError(
      422,
      "INVALID_INPUT",
      "Workflow definition failed validation.",
    );
  }
  return validation.data;
}

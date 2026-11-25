import type { DocumentRepository } from "@flowpilot/db/repositories";
import {
  WorkflowProposalSchema,
  type WorkflowProposal,
  type WorkflowProposalRequest,
} from "@flowpilot/shared";
import { HttpError } from "../../errors/api-error.js";
import { OpenRouterError } from "../../adapters/openrouter.js";
import type { StructuredRequest } from "../../adapters/openrouter.js";
import { validateWorkflowGraph } from "@flowpilot/shared";

const WorkflowProposalJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["definition", "warnings"],
  properties: {
    definition: {
      type: "object",
      additionalProperties: false,
      required: ["version", "nodes", "edges"],
      properties: {
        version: { type: "integer", const: 1 },
        nodes: {
          type: "array",
          minItems: 1,
          maxItems: 25,
          items: {
            oneOf: [
              {
                type: "object",
                additionalProperties: false,
                required: ["id", "position", "kind", "config"],
                properties: {
                  id: { type: "string", minLength: 1, maxLength: 64 },
                  position: {
                    type: "object",
                    additionalProperties: false,
                    required: ["x", "y"],
                    properties: { x: { type: "number" }, y: { type: "number" } },
                  },
                  kind: { const: "extract_document" },
                  config: {
                    type: "object",
                    additionalProperties: false,
                    properties: {},
                  },
                },
              },
              {
                type: "object",
                additionalProperties: false,
                required: ["id", "position", "kind", "config"],
                properties: {
                  id: { type: "string", minLength: 1, maxLength: 64 },
                  position: {
                    type: "object",
                    additionalProperties: false,
                    required: ["x", "y"],
                    properties: { x: { type: "number" }, y: { type: "number" } },
                  },
                  kind: { const: "analyze_document" },
                  config: {
                    type: "object",
                    additionalProperties: false,
                    required: ["sections"],
                    properties: {
                      sections: {
                        type: "array",
                        minItems: 1,
                        uniqueItems: true,
                        items: {
                          type: "string",
                          enum: ["summary", "dates", "action_items"],
                        },
                      },
                    },
                  },
                },
              },
              {
                type: "object",
                additionalProperties: false,
                required: ["id", "position", "kind", "config"],
                properties: {
                  id: { type: "string", minLength: 1, maxLength: 64 },
                  position: {
                    type: "object",
                    additionalProperties: false,
                    required: ["x", "y"],
                    properties: { x: { type: "number" }, y: { type: "number" } },
                  },
                  kind: { const: "create_report" },
                  config: {
                    type: "object",
                    additionalProperties: false,
                    required: ["title"],
                    properties: {
                      title: { type: "string", minLength: 1, maxLength: 120 },
                    },
                  },
                },
              },
              {
                type: "object",
                additionalProperties: false,
                required: ["id", "position", "kind", "config"],
                properties: {
                  id: { type: "string", minLength: 1, maxLength: 64 },
                  position: {
                    type: "object",
                    additionalProperties: false,
                    required: ["x", "y"],
                    properties: { x: { type: "number" }, y: { type: "number" } },
                  },
                  kind: { const: "replace_report" },
                  config: {
                    type: "object",
                    additionalProperties: false,
                    required: ["reportId"],
                    properties: { reportId: { type: "string", format: "uuid" } },
                  },
                },
              },
              {
                type: "object",
                additionalProperties: false,
                required: ["id", "position", "kind", "config"],
                properties: {
                  id: { type: "string", minLength: 1, maxLength: 64 },
                  position: {
                    type: "object",
                    additionalProperties: false,
                    required: ["x", "y"],
                    properties: { x: { type: "number" }, y: { type: "number" } },
                  },
                  kind: { const: "condition" },
                  config: {
                    oneOf: [
                      {
                        type: "object",
                        additionalProperties: false,
                        required: ["field", "operator", "value"],
                        properties: {
                          field: { const: "has_action_items" },
                          operator: { const: "equals" },
                          value: { type: "boolean" },
                        },
                      },
                      {
                        type: "object",
                        additionalProperties: false,
                        required: ["field", "operator", "value"],
                        properties: {
                          field: { const: "date_count" },
                          operator: { enum: ["equals", "greater_than"] },
                          value: { type: "integer", minimum: 0 },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
        edges: {
          type: "array",
          maxItems: 60,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "source", "target"],
            properties: {
              id: { type: "string", minLength: 1, maxLength: 128 },
              source: { type: "string", minLength: 1, maxLength: 64 },
              target: { type: "string", minLength: 1, maxLength: 64 },
              branch: { type: "string", enum: ["true", "false"] },
            },
          },
        },
      },
    },
    warnings: { type: "array", maxItems: 20, items: { type: "string", maxLength: 500 } },
  },
};

const SYSTEM_PROMPT = [
  "Create a version-1 workflow graph using only the supplied approved node kinds.",
  "Never output code, arbitrary tools, external URLs, credentials, or extra fields.",
  "Use unique node and edge IDs, exactly one root, reachable nodes, and no cycles.",
  "Condition nodes must have exactly one true and one false outgoing edge.",
  "For a document summary workflow, use extract_document, analyze_document, and create_report.",
  "Do not include document contents in the workflow.",
].join(" ");

export interface WorkflowProposalClient {
  requestStructuredOutput<T>(request: StructuredRequest<T>): Promise<T>;
}

function providerError(error: OpenRouterError): HttpError {
  if (error.code === "INVALID_STRUCTURED_OUTPUT") {
    return new HttpError(
      422,
      "INVALID_INPUT",
      "The AI returned a workflow that could not be validated.",
    );
  }
  return new HttpError(
    503,
    "SERVICE_UNAVAILABLE",
    "Workflow generation is temporarily unavailable.",
  );
}

export function createWorkflowProposalService(
  client: WorkflowProposalClient,
  documents: Pick<DocumentRepository, "findById">,
) {
  return {
    async propose(
      userId: string,
      workspaceId: string,
      input: WorkflowProposalRequest,
    ): Promise<WorkflowProposal> {
      if (input.documentId) {
        const document = await documents.findById(
          { userId, workspaceId },
          input.documentId,
        );
        if (!document) throw new HttpError(404, "NOT_FOUND", "Document was not found.");
        if (document.status !== "ready") {
          throw new HttpError(409, "CONFLICT", "The document is not ready for a workflow.");
        }
      }

      let repairContext = "";
      for (let attempt = 0; attempt < 2; attempt += 1) {
        let proposal: WorkflowProposal;
        try {
          proposal = await client.requestStructuredOutput({
            schemaName: "flowpilot_workflow_proposal_v1",
            jsonSchema: WorkflowProposalJsonSchema,
            validator: WorkflowProposalSchema,
            systemPrompt: SYSTEM_PROMPT,
            userPrompt: [
              `User task: ${input.prompt}`,
              input.documentId
                ? "A validated document is attached to the workflow execution."
                : "No document is attached yet.",
              repairContext,
            ]
              .filter(Boolean)
              .join("\n\n"),
          });
        } catch (error) {
          if (error instanceof OpenRouterError) {
            if (error.code === "INVALID_STRUCTURED_OUTPUT" && attempt === 0) {
              repairContext =
                "The previous output did not match the required schema. Return a corrected complete workflow proposal.";
              continue;
            }
            throw providerError(error);
          }
          throw error;
        }

        const validation = validateWorkflowGraph(proposal.definition);
        if (validation.success) {
          return {
            ...proposal,
            definition: validation.data,
          };
        }

        if (attempt === 1) {
          throw new HttpError(
            422,
            "INVALID_INPUT",
            "The AI workflow proposal failed graph validation.",
          );
        }
        repairContext = [
          "Repair this workflow graph. Keep only the approved node kinds and preserve the user's intent.",
          `Validation issues: ${validation.issues.join("; ")}`,
          `Previous graph: ${JSON.stringify(proposal.definition)}`,
        ].join("\n");
      }
      throw new HttpError(
        422,
        "INVALID_INPUT",
        "The AI workflow proposal failed graph validation.",
      );
    },
  };
}

export type WorkflowProposalService = ReturnType<
  typeof createWorkflowProposalService
>;

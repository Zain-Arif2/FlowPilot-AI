import type { DocumentRepository } from "@flowpilot/db/repositories";
import {
  WorkflowProposalSchema,
  type WorkflowProposal,
  type WorkflowProposalRequest,
} from "@flowpilot/shared";
import { HttpError } from "../../errors/api-error.js";
import { OpenRouterError } from "../../adapters/openrouter.js";
import type { StructuredRequest } from "../../adapters/openrouter.js";
import { apiLogger } from "../../middleware/logger.js";
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
  "Create a version-1 workflow graph using only these approved node kinds: extract_document, analyze_document, create_report, replace_report, and condition.",
  "Never output code, arbitrary tools, external URLs, credentials, or extra fields.",
  "For document workflows, start with exactly one extract_document step, then analyze_document, then create_report or replace_report. Never duplicate extract_document.",
  "Use condition only when the user requests branching, and place it after analyze_document. Each condition must have exactly one true and one false outgoing edge; each branch must continue from its own target.",
  "Example for a document summary: {\"definition\":{\"version\":1,\"nodes\":[{\"id\":\"extract\",\"position\":{\"x\":0,\"y\":0},\"kind\":\"extract_document\",\"config\":{}},{\"id\":\"analyze\",\"position\":{\"x\":0,\"y\":100},\"kind\":\"analyze_document\",\"config\":{\"sections\":[\"summary\",\"dates\",\"action_items\"]}},{\"id\":\"report\",\"position\":{\"x\":0,\"y\":200},\"kind\":\"create_report\",\"config\":{\"title\":\"Document summary\"}}],\"edges\":[{\"id\":\"extract-analyze\",\"source\":\"extract\",\"target\":\"analyze\"},{\"id\":\"analyze-report\",\"source\":\"analyze\",\"target\":\"report\"}]},\"warnings\":[]}.",
  "Use unique node and edge IDs, exactly one root, reachable nodes, and no cycles.",
  "Do not include document contents in the workflow.",
].join(" ");

function canReach(
  definition: WorkflowProposal["definition"],
  from: string,
  to: string,
  blockedNodeIds: ReadonlySet<string> = new Set(),
): boolean {
  const outgoing = new Map<string, string[]>();
  for (const edge of definition.edges) {
    const targets = outgoing.get(edge.source) ?? [];
    targets.push(edge.target);
    outgoing.set(edge.source, targets);
  }

  const pending = [from];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || visited.has(current) || blockedNodeIds.has(current)) continue;
    if (current === to) return true;
    visited.add(current);
    pending.push(...(outgoing.get(current) ?? []));
  }
  return false;
}

function validateProposalSemantics(
  definition: WorkflowProposal["definition"],
): string[] {
  const issues: string[] = [];
  const extracts = definition.nodes.filter((node) => node.kind === "extract_document");
  const analyses = definition.nodes.filter((node) => node.kind === "analyze_document");
  const reports = definition.nodes.filter(
    (node) => node.kind === "create_report" || node.kind === "replace_report",
  );
  const conditions = definition.nodes.filter((node) => node.kind === "condition");

  if (extracts.length !== 1) {
    issues.push("A document workflow must contain exactly one extract_document step.");
  }
  if (analyses.length === 0) {
    issues.push("A document workflow must contain an analyze_document step.");
  }
  if (reports.length === 0) {
    issues.push("A document workflow must contain a report step after analysis.");
  }

  const extract = extracts[0];
  if (!extract) return issues;

  const incomingIds = new Set(definition.edges.map((edge) => edge.target));
  if (incomingIds.has(extract.id)) {
    issues.push("The extract_document step must be the workflow root.");
  }

  const analysisIds = new Set(analyses.map((node) => node.id));
  const analysesReachableFromExtract = analyses.filter((node) =>
    canReach(definition, extract.id, node.id),
  );
  if (analyses.length > 0 && analysesReachableFromExtract.length === 0) {
    issues.push("analyze_document must follow extract_document.");
  }

  const reportsAfterAnalysis = reports.filter((report) =>
    analyses.some((analysis) => canReach(definition, analysis.id, report.id)),
  );
  if (reports.length > 0 && reportsAfterAnalysis.length === 0) {
    issues.push("A report step must follow analyze_document.");
  }

  const bypassesAnalysis = (targetId: string): boolean =>
    canReach(definition, extract.id, targetId, analysisIds);
  for (const node of [...conditions, ...reports]) {
    if (bypassesAnalysis(node.id)) {
      issues.push(`${node.kind} must not run before analyze_document.`);
    }
  }
  for (const report of reports) {
    if (!reportsAfterAnalysis.some((node) => node.id === report.id)) {
      issues.push("Every report branch must follow analyze_document.");
      break;
    }
  }
  for (const condition of conditions) {
    if (!analyses.some((analysis) => canReach(definition, analysis.id, condition.id))) {
      issues.push("Every condition must follow analyze_document.");
      break;
    }
  }
  return [...new Set(issues)];
}

export interface WorkflowProposalClient {
  requestStructuredOutput<T>(request: StructuredRequest<T>): Promise<T>;
}

function providerError(error: OpenRouterError): HttpError {
  if (error.code === "PROVIDER_RATE_LIMITED") {
    return new HttpError(
      429,
      "RATE_LIMITED",
      "Workflow generation is rate-limited. Please try again shortly.",
    );
  }
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
      let usedDataCollectionFallback = false;
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
            onDataCollectionFallback: () => {
              usedDataCollectionFallback = true;
            },
          });
        } catch (error) {
          if (error instanceof OpenRouterError) {
            apiLogger.warn(
              {
                providerStatus: error.httpStatus,
                providerFailure: error.providerReason ?? error.code,
              },
              "Workflow proposal provider request failed",
            );
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
        const semanticIssues = validation.success
          ? validateProposalSemantics(validation.data)
          : [];
        const issues = validation.success ? semanticIssues : validation.issues;
        if (issues.length === 0 && validation.success) {
          return {
            ...proposal,
            definition: validation.data,
            warnings: usedDataCollectionFallback
              ? [
                  ...proposal.warnings,
                  "This development request used OpenRouter data_collection=allow. Do not send sensitive data.",
                ]
              : proposal.warnings,
          };
        }

        if (attempt === 1) {
          throw new HttpError(
            422,
            "INVALID_INPUT",
            validation.success
              ? "The AI workflow proposal failed step-order validation."
              : "The AI workflow proposal failed graph validation.",
          );
        }
        repairContext = [
          "Repair the workflow to satisfy the validation issues. Keep only approved node kinds, preserve valid condition branches, and preserve the user's intent.",
          `Validation issues: ${issues.join("; ")}`,
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

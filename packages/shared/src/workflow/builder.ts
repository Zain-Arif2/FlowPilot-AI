import {
  WorkflowDefinitionSchema,
  WorkflowEdgeSchema,
  WorkflowNodeSchema,
  type WorkflowDefinition,
  type WorkflowNode,
} from "./schema.js";

export interface WorkflowBuilderConnection {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly sourceHandle?: string | null;
}

export class WorkflowBuilderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowBuilderError";
  }
}

export function createWorkflowNode(
  kind: WorkflowNode["kind"],
  id: string,
  position: WorkflowNode["position"],
  replaceReportId?: string,
): WorkflowNode {
  switch (kind) {
    case "extract_document":
      return WorkflowNodeSchema.parse({ id, kind, position, config: {} });
    case "analyze_document":
      return WorkflowNodeSchema.parse({
        id,
        kind,
        position,
        config: { sections: ["summary", "dates", "action_items"] },
      });
    case "create_report":
      return WorkflowNodeSchema.parse({
        id,
        kind,
        position,
        config: { title: "New report" },
      });
    case "condition":
      return WorkflowNodeSchema.parse({
        id,
        kind,
        position,
        config: { field: "has_action_items", operator: "equals", value: true },
      });
    case "replace_report":
      if (!replaceReportId) {
        throw new WorkflowBuilderError(
          "Choose an existing report before adding a replacement step.",
        );
      }
      return WorkflowNodeSchema.parse({
        id,
        kind,
        position,
        config: { reportId: replaceReportId },
      });
  }
}

export function addWorkflowNode(
  definition: WorkflowDefinition,
  node: WorkflowNode,
): WorkflowDefinition {
  const parsedNode = WorkflowNodeSchema.parse(node);
  if (definition.nodes.length >= 25) {
    throw new WorkflowBuilderError("A workflow can contain at most 25 steps.");
  }
  if (definition.nodes.some((existing) => existing.id === parsedNode.id)) {
    throw new WorkflowBuilderError("Workflow step IDs must be unique.");
  }
  return { ...definition, nodes: [...definition.nodes, parsedNode] };
}

export function removeWorkflowNode(
  definition: WorkflowDefinition,
  nodeId: string,
): WorkflowDefinition {
  if (!definition.nodes.some((node) => node.id === nodeId)) {
    throw new WorkflowBuilderError("Workflow step was not found.");
  }
  return {
    ...definition,
    nodes: definition.nodes.filter((node) => node.id !== nodeId),
    edges: definition.edges.filter(
      (edge) => edge.source !== nodeId && edge.target !== nodeId,
    ),
  };
}

export function connectWorkflowNodes(
  definition: WorkflowDefinition,
  connection: WorkflowBuilderConnection,
): WorkflowDefinition {
  const source = definition.nodes.find((node) => node.id === connection.source);
  const target = definition.nodes.find((node) => node.id === connection.target);
  if (!source || !target) {
    throw new WorkflowBuilderError("Choose existing workflow steps to connect.");
  }
  if (source.id === target.id) {
    throw new WorkflowBuilderError("A workflow step cannot connect to itself.");
  }
  if (definition.edges.length >= 60) {
    throw new WorkflowBuilderError("A workflow can contain at most 60 connections.");
  }
  if (definition.edges.some((edge) => edge.id === connection.id)) {
    throw new WorkflowBuilderError("Workflow connection IDs must be unique.");
  }

  let branch: "true" | "false" | undefined;
  if (source.kind === "condition") {
    if (connection.sourceHandle !== "true" && connection.sourceHandle !== "false") {
      throw new WorkflowBuilderError(
        "Condition connections must use the true or false branch.",
      );
    }
    branch = connection.sourceHandle;
    if (
      definition.edges.some(
        (edge) => edge.source === source.id && edge.branch === branch,
      )
    ) {
      throw new WorkflowBuilderError(
        `The ${branch} condition branch is already connected.`,
      );
    }
  } else {
    if (connection.sourceHandle) {
      throw new WorkflowBuilderError(
        "Only condition steps can define true or false branches.",
      );
    }
    if (definition.edges.some((edge) => edge.source === source.id)) {
      throw new WorkflowBuilderError(
        "A regular workflow step can have only one outgoing connection.",
      );
    }
  }

  const edge = WorkflowEdgeSchema.parse({
    id: connection.id,
    source: source.id,
    target: target.id,
    ...(branch ? { branch } : {}),
  });
  return { ...definition, edges: [...definition.edges, edge] };
}

export function serializeWorkflowBuilder(
  nodes: readonly WorkflowNode[],
  connections: readonly WorkflowBuilderConnection[],
): WorkflowDefinition {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  return WorkflowDefinitionSchema.parse({
    version: 1,
    nodes: nodes.map((node) => WorkflowNodeSchema.parse(node)),
    edges: connections.map((connection) => {
      const source = nodesById.get(connection.source);
      const branch =
        source?.kind === "condition" &&
        (connection.sourceHandle === "true" ||
          connection.sourceHandle === "false")
          ? connection.sourceHandle
          : undefined;
      return WorkflowEdgeSchema.parse({
        id: connection.id,
        source: connection.source,
        target: connection.target,
        ...(branch ? { branch } : {}),
      });
    }),
  });
}

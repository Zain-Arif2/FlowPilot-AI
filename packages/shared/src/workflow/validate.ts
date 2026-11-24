import {
  WorkflowDefinitionSchema,
  type ConditionConfig,
  type WorkflowDefinition,
} from "./schema.js";

export type WorkflowValidationResult =
  { success: true; data: WorkflowDefinition } | { success: false; issues: string[] };

export function validateWorkflowGraph(input: unknown): WorkflowValidationResult {
  const parsed = WorkflowDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "workflow"}: ${issue.message}`,
      ),
    };
  }

  const { nodes, edges } = parsed.data;
  const issues: string[] = [];
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, typeof edges>();

  for (const node of nodes) {
    if (nodeIds.has(node.id)) issues.push(`Duplicate node id: ${node.id}`);
    nodeIds.add(node.id);
    incoming.set(node.id, 0);
    outgoing.set(node.id, []);
  }

  for (const edge of edges) {
    if (edgeIds.has(edge.id)) issues.push(`Duplicate edge id: ${edge.id}`);
    edgeIds.add(edge.id);

    const source = nodesById.get(edge.source);
    if (!source || !nodesById.has(edge.target)) {
      issues.push(`Edge ${edge.id} references an unknown node`);
      continue;
    }

    if (edge.source === edge.target) {
      issues.push(`Edge ${edge.id} cannot point to itself`);
    }

    const sourceEdges = outgoing.get(edge.source);
    if (sourceEdges) sourceEdges.push(edge);
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);

    if (source.kind === "condition") {
      if (!edge.branch) issues.push(`Condition edge ${edge.id} requires a branch`);
    } else if (edge.branch) {
      issues.push(`Non-condition edge ${edge.id} cannot define a branch`);
    }
  }

  const roots = nodes.filter((node) => incoming.get(node.id) === 0);
  if (roots.length !== 1) issues.push("Workflow must have exactly one root");

  for (const node of nodes) {
    const nodeEdges = outgoing.get(node.id) ?? [];
    if (node.kind === "condition") {
      const branches = nodeEdges.map((edge) => edge.branch);
      if (
        nodeEdges.length !== 2 ||
        branches.filter((branch) => branch === "true").length !== 1 ||
        branches.filter((branch) => branch === "false").length !== 1
      ) {
        issues.push(
          `Condition node ${node.id} must have exactly one true and one false edge`,
        );
      }
    } else if (nodeEdges.length > 1) {
      issues.push(`Non-condition node ${node.id} cannot have multiple outgoing edges`);
    }
  }

  const visited = new Set<string>();
  const active = new Set<string>();
  let hasCycle = false;
  const visit = (nodeId: string): void => {
    if (active.has(nodeId)) {
      hasCycle = true;
      return;
    }
    if (visited.has(nodeId)) return;
    active.add(nodeId);
    visited.add(nodeId);
    for (const edge of outgoing.get(nodeId) ?? []) visit(edge.target);
    active.delete(nodeId);
  };

  for (const node of nodes) visit(node.id);
  if (hasCycle) issues.push("Workflow cannot contain cycles");

  const reachable = new Set<string>();
  const visitReachable = (nodeId: string): void => {
    if (reachable.has(nodeId)) return;
    reachable.add(nodeId);
    for (const edge of outgoing.get(nodeId) ?? []) visitReachable(edge.target);
  };
  const root = roots[0];
  if (root) visitReachable(root.id);
  if (reachable.size !== nodes.length)
    issues.push("Every node must be reachable from the root");

  return issues.length > 0
    ? { success: false, issues }
    : { success: true, data: parsed.data };
}

export interface ConditionValues {
  readonly hasActionItems?: boolean;
  readonly dateCount?: number;
}

export class ConditionEvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConditionEvaluationError";
  }
}

export function evaluateCondition(
  condition: ConditionConfig,
  values: ConditionValues,
): boolean {
  if (condition.field === "has_action_items") {
    if (typeof values.hasActionItems !== "boolean") {
      throw new ConditionEvaluationError("Action-item result is unavailable");
    }
    return values.hasActionItems === condition.value;
  }

  if (typeof values.dateCount !== "number" || !Number.isInteger(values.dateCount)) {
    throw new ConditionEvaluationError("Date-count result is unavailable");
  }

  return condition.operator === "equals"
    ? values.dateCount === condition.value
    : values.dateCount > condition.value;
}

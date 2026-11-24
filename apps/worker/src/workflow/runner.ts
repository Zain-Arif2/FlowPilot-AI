import {
  evaluateCondition,
  validateWorkflowGraph,
  type ConditionValues,
  type WorkflowDefinition,
  type WorkflowNode,
} from "@flowpilot/shared";
import { ConditionEvaluationError } from "@flowpilot/shared";

export interface RunnerState {
  readonly completedNodeIds: ReadonlySet<string>;
  readonly conditionResults: ReadonlyMap<string, ConditionValues>;
}

export class InvalidWorkflowExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWorkflowExecutionError";
  }
}

export function getNextExecutableNode(
  input: WorkflowDefinition,
  state: RunnerState,
): WorkflowNode | null {
  const validated = validateWorkflowGraph(input);
  if (!validated.success) {
    throw new InvalidWorkflowExecutionError(validated.issues.join("; "));
  }
  const graph = validated.data;
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, typeof graph.edges>();
  const incoming = new Map<string, string[]>();
  for (const node of graph.nodes) {
    outgoing.set(node.id, []);
    incoming.set(node.id, []);
  }
  for (const edge of graph.edges) {
    outgoing.get(edge.source)?.push(edge);
    incoming.get(edge.target)?.push(edge.source);
  }

  const active = new Set<string>();
  const visit = (nodeId: string): void => {
    if (active.has(nodeId)) return;
    active.add(nodeId);
    const node = nodesById.get(nodeId);
    if (!node) return;

    const edges = outgoing.get(nodeId) ?? [];
    if (node.kind === "condition") {
      if (!state.completedNodeIds.has(nodeId)) return;
      const values = state.conditionResults.get(nodeId);
      if (!values) {
        throw new ConditionEvaluationError(
          `Condition result for ${nodeId} is unavailable`,
        );
      }
      const result = evaluateCondition(node.config, values);
      const selected = edges.find((edge) => edge.branch === String(result));
      if (selected) visit(selected.target);
      return;
    }
    for (const edge of edges) visit(edge.target);
  };

  const root = graph.nodes.find((node) => (incoming.get(node.id) ?? []).length === 0);
  if (!root) throw new InvalidWorkflowExecutionError("Workflow root was not found.");
  visit(root.id);

  const scheduled = new Set<string>();
  const remaining = new Set(active);
  while (remaining.size > 0) {
    const ready = graph.nodes.find(
      (node) =>
        remaining.has(node.id) &&
        (incoming.get(node.id) ?? []).every(
          (predecessorId) =>
            !active.has(predecessorId) || state.completedNodeIds.has(predecessorId),
        ),
    );
    if (!ready) {
      throw new InvalidWorkflowExecutionError("No workflow node is ready to execute.");
    }
    scheduled.add(ready.id);
    remaining.delete(ready.id);
    if (!state.completedNodeIds.has(ready.id)) return ready;
  }
  return null;
}

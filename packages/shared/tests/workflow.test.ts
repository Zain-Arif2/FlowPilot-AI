import { describe, expect, it } from "vitest";
import {
  ConditionEvaluationError,
  evaluateCondition,
  validateWorkflowGraph,
  type WorkflowDefinition,
} from "../src/index.js";

const validGraph: WorkflowDefinition = {
  version: 1,
  nodes: [
    { id: "extract", kind: "extract_document", position: { x: 0, y: 0 }, config: {} },
    {
      id: "analyze",
      kind: "analyze_document",
      position: { x: 0, y: 100 },
      config: { sections: ["summary", "dates"] },
    },
    {
      id: "condition",
      kind: "condition",
      position: { x: 0, y: 200 },
      config: { field: "date_count", operator: "greater_than", value: 0 },
    },
    {
      id: "report",
      kind: "create_report",
      position: { x: 100, y: 300 },
      config: { title: "Report" },
    },
    {
      id: "empty",
      kind: "create_report",
      position: { x: -100, y: 300 },
      config: { title: "No dates" },
    },
  ],
  edges: [
    { id: "e1", source: "extract", target: "analyze" },
    { id: "e2", source: "analyze", target: "condition" },
    { id: "e3", source: "condition", target: "report", branch: "true" },
    { id: "e4", source: "condition", target: "empty", branch: "false" },
  ],
};

describe("workflow graph validation", () => {
  it("accepts a bounded, reachable DAG with exactly two condition branches", () => {
    expect(validateWorkflowGraph(validGraph)).toMatchObject({ success: true });
  });

  it("rejects cycles and unresolved edges", () => {
    const cyclic = {
      ...validGraph,
      edges: [...validGraph.edges, { id: "e5", source: "report", target: "extract" }],
    };
    const result = validateWorkflowGraph(cyclic);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.join(" ")).toContain("cycles");

    const unresolved = {
      ...validGraph,
      edges: [...validGraph.edges, { id: "e5", source: "extract", target: "missing" }],
    };
    expect(validateWorkflowGraph(unresolved).success).toBe(false);
  });

  it("rejects duplicate IDs, unreachable nodes, and invalid branch shapes", () => {
    const duplicate = {
      ...validGraph,
      nodes: [...validGraph.nodes, { ...validGraph.nodes[0]! }],
    };
    expect(validateWorkflowGraph(duplicate).success).toBe(false);

    const missingBranch = {
      ...validGraph,
      edges: validGraph.edges.filter((edge) => edge.id !== "e4"),
    };
    expect(validateWorkflowGraph(missingBranch).success).toBe(false);

    const extraRoot = {
      ...validGraph,
      nodes: [
        ...validGraph.nodes,
        {
          id: "orphan",
          kind: "extract_document" as const,
          position: { x: 10, y: 10 },
          config: {},
        },
      ],
    };
    expect(validateWorkflowGraph(extraRoot).success).toBe(false);
  });

  it("rejects more than the supported node and edge bounds", () => {
    const oversizedNodes = {
      version: 1,
      nodes: Array.from({ length: 26 }, (_, index) => ({
        id: `n${index}`,
        kind: "extract_document",
        position: { x: index, y: 0 },
        config: {},
      })),
      edges: [],
    };
    expect(validateWorkflowGraph(oversizedNodes).success).toBe(false);
  });

  it("evaluates only fixed operators and fails when the required value is missing", () => {
    expect(
      evaluateCondition(
        { field: "date_count", operator: "greater_than", value: 1 },
        { dateCount: 2 },
      ),
    ).toBe(true);
    expect(() =>
      evaluateCondition(
        { field: "has_action_items", operator: "equals", value: true },
        {},
      ),
    ).toThrow(ConditionEvaluationError);
  });
});

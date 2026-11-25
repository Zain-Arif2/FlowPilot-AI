import { describe, expect, it } from "vitest";
import {
  connectWorkflowNodes,
  createWorkflowNode,
  removeWorkflowNode,
  serializeWorkflowBuilder,
} from "../src/workflow/builder.js";
import type { WorkflowDefinition } from "../src/workflow/schema.js";

const startNode = createWorkflowNode("extract_document", "start", { x: 0, y: 0 });
const conditionNode = createWorkflowNode("condition", "condition", {
  x: 0,
  y: 100,
});
const trueNode = createWorkflowNode("create_report", "true-report", {
  x: 160,
  y: 240,
});
const falseNode = createWorkflowNode("create_report", "false-report", {
  x: -160,
  y: 240,
});

const baseDefinition: WorkflowDefinition = {
  version: 1,
  nodes: [startNode, conditionNode, trueNode, falseNode],
  edges: [],
};

describe("workflow builder graph operations", () => {
  it("creates typed default nodes and rejects invalid replacement targets", () => {
    expect(createWorkflowNode("analyze_document", "analysis", { x: 0, y: 0 })).toMatchObject({
      kind: "analyze_document",
      config: { sections: ["summary", "dates", "action_items"] },
    });
    expect(() =>
      createWorkflowNode("replace_report", "replace", { x: 0, y: 0 }),
    ).toThrow(/report/i);
  });

  it("removes a node and its connected edges without mutating the source graph", () => {
    const connected = connectWorkflowNodes(baseDefinition, {
      id: "start-condition",
      source: "start",
      target: "condition",
    });
    const removed = removeWorkflowNode(connected, "condition");

    expect(removed.nodes.map((node) => node.id)).toEqual([
      "start",
      "true-report",
      "false-report",
    ]);
    expect(removed.edges).toEqual([]);
    expect(connected.nodes).toHaveLength(4);
    expect(connected.edges).toHaveLength(1);
  });

  it("requires a unique true/false handle for each condition edge", () => {
    const trueConnected = connectWorkflowNodes(baseDefinition, {
      id: "true-edge",
      source: "condition",
      target: "true-report",
      sourceHandle: "true",
    });
    expect(() =>
      connectWorkflowNodes(trueConnected, {
        id: "duplicate-branch",
        source: "condition",
        target: "false-report",
        sourceHandle: "true",
      }),
    ).toThrow(/branch/i);
    expect(() =>
      connectWorkflowNodes(baseDefinition, {
        id: "missing-branch",
        source: "condition",
        target: "true-report",
      }),
    ).toThrow(/branch/i);
  });

  it("serializes React Flow condition handles as the fixed branch values", () => {
    const serialized = serializeWorkflowBuilder(
      [startNode, conditionNode, trueNode, falseNode],
      [
        { id: "start-condition", source: "start", target: "condition" },
        {
          id: "true-edge",
          source: "condition",
          target: "true-report",
          sourceHandle: "true",
        },
        {
          id: "false-edge",
          source: "condition",
          target: "false-report",
          sourceHandle: "false",
        },
      ],
    );

    expect(serialized.edges).toEqual([
      { id: "start-condition", source: "start", target: "condition" },
      {
        id: "true-edge",
        source: "condition",
        target: "true-report",
        branch: "true",
      },
      {
        id: "false-edge",
        source: "condition",
        target: "false-report",
        branch: "false",
      },
    ]);
  });
});

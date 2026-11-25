import { describe, expect, it } from "vitest";
import type { WorkflowDefinition } from "@flowpilot/shared";
import { getNextExecutableNode } from "../src/workflow/runner.js";

const graph: WorkflowDefinition = {
  version: 1,
  nodes: [
    { id: "condition", kind: "condition", position: { x: 0, y: 0 }, config: {
      field: "has_action_items",
      operator: "equals",
      value: true,
    } },
    {
      id: "true",
      kind: "create_report",
      position: { x: 100, y: 100 },
      config: { title: "Has action items" },
    },
    {
      id: "false",
      kind: "create_report",
      position: { x: -100, y: 100 },
      config: { title: "No action items" },
    },
  ],
  edges: [
    { id: "true-edge", source: "condition", target: "true", branch: "true" },
    { id: "false-edge", source: "condition", target: "false", branch: "false" },
  ],
};

describe("conditional workflow execution", () => {
  it.each([
    [true, "true"],
    [false, "false"],
  ] as const)("executes only the %s branch for the matching condition result", (
    hasActionItems,
    expectedNodeId,
  ) => {
    const next = getNextExecutableNode(graph, {
      completedNodeIds: new Set(["condition"]),
      conditionResults: new Map([["condition", { hasActionItems }]]),
    });

    expect(next?.id).toBe(expectedNodeId);
  });
});

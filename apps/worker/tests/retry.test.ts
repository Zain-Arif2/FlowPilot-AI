import { describe, expect, it } from "vitest";
import type { WorkflowDefinition } from "@flowpilot/shared";
import { getNextExecutableNode } from "../src/workflow/runner.js";
import { getRetryDecision } from "../src/workflow/retry.js";

const graph: WorkflowDefinition = {
  version: 1,
  nodes: [
    { id: "extract", kind: "extract_document", position: { x: 0, y: 0 }, config: {} },
    {
      id: "analyze",
      kind: "analyze_document",
      position: { x: 0, y: 100 },
      config: { sections: ["summary"] },
    },
    {
      id: "report",
      kind: "create_report",
      position: { x: 0, y: 200 },
      config: { title: "Summary" },
    },
  ],
  edges: [
    { id: "edge-1", source: "extract", target: "analyze" },
    { id: "edge-2", source: "analyze", target: "report" },
  ],
};

describe("workflow retry behavior", () => {
  it("retries explicit transient failures but stops on permanent failures", () => {
    expect(
      getRetryDecision(
        { failureKind: "transient", attemptNumber: 1, explicitlyRetryable: true },
        () => 1,
      ).retry,
    ).toBe(true);
    expect(
      getRetryDecision({
        failureKind: "permanent",
        attemptNumber: 1,
        explicitlyRetryable: true,
      }),
    ).toEqual({ retry: false });
  });

  it("skips completed steps and schedules the failed step without re-running earlier work", () => {
    const next = getNextExecutableNode(graph, {
      completedNodeIds: new Set(["extract"]),
      conditionResults: new Map(),
    });
    expect(next?.id).toBe("analyze");
    expect(next?.id).not.toBe("extract");
  });
});

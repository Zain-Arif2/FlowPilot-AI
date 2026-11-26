import { describe, expect, it } from "vitest";
import { validateWorkflowGraph } from "@flowpilot/shared";
import {
  createInitialCanvasState,
  fromCanvas,
} from "../src/features/workflow-builder/canvas-graph.js";

describe("workflow canvas initialization", () => {
  it("initializes nodes and edges from the same valid graph", () => {
    const { nodes, edges } = createInitialCanvasState();
    const definition = fromCanvas(nodes, edges);

    expect(validateWorkflowGraph(definition)).toMatchObject({ success: true });
    expect(nodes).toHaveLength(3);
    expect(edges).toHaveLength(2);
  });
});

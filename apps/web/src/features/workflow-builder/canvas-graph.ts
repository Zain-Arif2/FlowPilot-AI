import { MarkerType, type Edge } from "@xyflow/react";
import {
  addWorkflowNode,
  connectWorkflowNodes,
  createWorkflowNode,
  serializeWorkflowBuilder,
  type WorkflowDefinition,
} from "@flowpilot/shared";
import type { CanvasNode } from "./workflow-node.js";

export type CanvasEdge = Edge;

export function toCanvasNodes(definition: WorkflowDefinition): CanvasNode[] {
  return definition.nodes.map((workflowNode) => ({
    id: workflowNode.id,
    type: "workflowStep",
    position: workflowNode.position,
    data: { workflowNode },
  }));
}

export function toCanvasEdges(definition: WorkflowDefinition): CanvasEdge[] {
  return definition.edges.map((workflowEdge) => ({
    id: workflowEdge.id,
    source: workflowEdge.source,
    target: workflowEdge.target,
    ...(workflowEdge.branch ? { sourceHandle: workflowEdge.branch } : {}),
    type: "smoothstep",
    animated: false,
    style: { stroke: "#7b7896", strokeWidth: 1.75 },
    label: workflowEdge.branch
      ? workflowEdge.branch === "true"
        ? "True"
        : "False"
      : undefined,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#7b7896" },
  }));
}

export function fromCanvas(
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
): WorkflowDefinition {
  return serializeWorkflowBuilder(
    nodes.map((node) => ({
      ...node.data.workflowNode,
      position: node.position,
    })),
    edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...(edge.sourceHandle === undefined
        ? {}
        : { sourceHandle: edge.sourceHandle }),
    })),
  );
}

export function createInitialWorkflowDefinition(): WorkflowDefinition {
  const extract = createWorkflowNode("extract_document", crypto.randomUUID(), {
    x: 160,
    y: 40,
  });
  const analyze = createWorkflowNode("analyze_document", crypto.randomUUID(), {
    x: 160,
    y: 190,
  });
  const report = createWorkflowNode("create_report", crypto.randomUUID(), {
    x: 160,
    y: 340,
  });
  let definition: WorkflowDefinition = {
    version: 1,
    nodes: [extract],
    edges: [],
  };
  definition = addWorkflowNode(definition, analyze);
  definition = addWorkflowNode(definition, report);
  definition = connectWorkflowNodes(definition, {
    id: crypto.randomUUID(),
    source: extract.id,
    target: analyze.id,
  });
  return connectWorkflowNodes(definition, {
    id: crypto.randomUUID(),
    source: analyze.id,
    target: report.id,
  });
}

export function createInitialCanvasState(): {
  readonly nodes: CanvasNode[];
  readonly edges: CanvasEdge[];
} {
  const definition = createInitialWorkflowDefinition();
  return {
    nodes: toCanvasNodes(definition),
    edges: toCanvasEdges(definition),
  };
}

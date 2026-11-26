import { describe, expect, it, vi } from "vitest";
import type { WorkflowDefinition } from "@flowpilot/shared";
import {
  OpenRouterError,
  type StructuredRequest,
} from "@flowpilot/shared/ai/openrouter";
import { createWorkflowExecutionProcessor } from "../src/processors/workflow.processor.js";
import type { DocumentAnalysisClient } from "../src/tools/analyze-document.js";
import type { ReportRepository } from "@flowpilot/db/repositories";

const userId = "00000000-0000-4000-8000-000000000001";
const workspaceId = "00000000-0000-4000-8000-000000000002";
const documentId = "00000000-0000-4000-8000-000000000003";
const executionId = "00000000-0000-4000-8000-000000000004";
const reportId = "00000000-0000-4000-8000-000000000005";

const reportContent = {
  summary: "Review the contract.",
  dates: ["2026-12-01"],
  actionItems: ["Sign the contract."],
};

function testUuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function workflow(nodes: WorkflowDefinition["nodes"]): WorkflowDefinition {
  return {
    version: 1,
    nodes,
    edges: nodes.slice(1).map((node, index) => ({
      id: `edge-${index}`,
      source: nodes[index]?.id ?? "",
      target: node.id,
    })),
  };
}

function createHarness(definition: WorkflowDefinition) {
  let executionStatus = "queued";
  const steps = definition.nodes.map((node, index) => ({
    id: testUuid(index + 10),
    nodeId: node.id,
    status: "pending",
    artifact: null as { publicId: string } | null,
  }));
  const attemptCounts = new Map<string, number>();
  const objects = new Map<string, Uint8Array>([
    ["source-text", new TextEncoder().encode("Contract text. Due date 2026-12-01.")],
  ]);
  const replacementRequest = vi.fn(async (input: unknown) => {
    expect(input).toBeDefined();
    return {
      approvalId: "approval-id",
      expectedReportRevision: 4,
      targetReportId: reportId,
    };
  });
  const reportCreate = vi.fn(
    async (
      _context: { readonly userId: string; readonly workspaceId: string },
      input: Parameters<ReportRepository["create"]>[1],
    ) => ({ id: reportId, content: input.content }),
  );
  const analysisClient: DocumentAnalysisClient = {
    async requestStructuredOutput<T>(request: StructuredRequest<T>): Promise<T> {
      return request.validator.parse(reportContent);
    },
  };
  const requestStructuredOutput = vi.spyOn(analysisClient, "requestStructuredOutput");

  const processor = createWorkflowExecutionProcessor({
    executions: {
      async startForWorker() {
        executionStatus = "running";
        return true;
      },
      async findForWorker() {
        return {
          id: executionId,
          status: executionStatus,
          documentId,
          workflowSnapshot: definition,
          steps: steps.map((step) => ({ ...step })),
        };
      },
      async beginStepAttempt(_context, input) {
        const step = steps.find((candidate) => candidate.id === input.executionStepId);
        if (
          !step ||
          step.status === "succeeded" ||
          step.status === "waiting_approval"
        ) {
          return null;
        }
        step.status = "running";
        const attemptNumber = (attemptCounts.get(step.id) ?? 0) + 1;
        attemptCounts.set(step.id, attemptNumber);
        return {
          attemptId: testUuid(Number(step.id.slice(-12)) + attemptNumber),
          attemptNumber,
        };
      },
      async completeStepAttempt(_context, input) {
        const step = steps.find((candidate) => candidate.id === input.executionStepId);
        if (!step) return false;
        step.status = "succeeded";
        step.artifact = { publicId: input.asset.publicId };
        return true;
      },
      async createReportReplacementApproval(_context, input) {
        const step = steps.find((candidate) => candidate.id === input.executionStepId);
        if (!step) return null;
        step.status = "waiting_approval";
        step.artifact = { publicId: input.asset.publicId };
        executionStatus = "waiting_approval";
        replacementRequest(input);
        return { approvalId: "approval-id" };
      },
      async failStepAttempt(_context, input) {
        const step = steps.find((candidate) => candidate.id === input.executionStepId);
        if (step) step.status = "failed";
      },
      async finish(_context, input) {
        executionStatus = input.status;
        return true;
      },
    },
    documents: {
      async findById() {
        return {
          id: documentId,
          status: "ready",
          textPublicId: "source-text",
        };
      },
    },
    reports: { create: reportCreate },
    workspaces: {
      async isOwner() {
        return true;
      },
    },
    storage: {
      async readObject(key) {
        const value = objects.get(key);
        if (!value) throw new Error("Missing test object.");
        return value;
      },
      async putObject(input) {
        objects.set(input.key, input.body);
      },
      async deleteObject(key) {
        objects.delete(key);
      },
    },
    analysisClient,
  });

  return {
    processor,
    analysisClient,
    attemptCounts,
    executionStatus: () => executionStatus,
    objects,
    reportCreate,
    replacementRequest,
    requestStructuredOutput,
    steps,
  };
}

describe("workflow execution processor", () => {
  it("extracts, analyzes, and creates a report while persisting every completed step", async () => {
    const harness = createHarness(
      workflow([
        {
          id: "extract",
          kind: "extract_document",
          position: { x: 0, y: 0 },
          config: {},
        },
        {
          id: "analyze",
          kind: "analyze_document",
          position: { x: 0, y: 100 },
          config: { sections: ["summary", "dates", "action_items"] },
        },
        {
          id: "report",
          kind: "create_report",
          position: { x: 0, y: 200 },
          config: { title: "Contract summary" },
        },
      ]),
    );

    await harness.processor({ executionId, workspaceId, userId });

    expect(harness.reportCreate).toHaveBeenCalledOnce();
    expect(harness.requestStructuredOutput).toHaveBeenCalledOnce();
    expect(harness.steps.map((step) => step.status)).toEqual([
      "succeeded",
      "succeeded",
      "succeeded",
    ]);
    expect(harness.executionStatus()).toBe("succeeded");
  });

  it("persists a report replacement proposal and pauses for human approval", async () => {
    const harness = createHarness(
      workflow([
        {
          id: "analyze",
          kind: "analyze_document",
          position: { x: 0, y: 0 },
          config: { sections: ["summary", "dates", "action_items"] },
        },
        {
          id: "replace",
          kind: "replace_report",
          position: { x: 0, y: 100 },
          config: { reportId },
        },
      ]),
    );

    await harness.processor({ executionId, workspaceId, userId });

    expect(harness.replacementRequest).toHaveBeenCalledOnce();
    expect(harness.replacementRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        targetReportId: reportId,
        sourceDocumentId: documentId,
        proposedContent: reportContent,
      }),
    );
    expect(harness.steps[1]?.status).toBe("waiting_approval");
    expect(harness.executionStatus()).toBe("waiting_approval");
    expect(harness.executionStatus()).not.toBe("succeeded");
  });

  it("retries a transient provider failure without repeating completed steps", async () => {
    const harness = createHarness(
      workflow([
        {
          id: "extract",
          kind: "extract_document",
          position: { x: 0, y: 0 },
          config: {},
        },
        {
          id: "analyze",
          kind: "analyze_document",
          position: { x: 0, y: 100 },
          config: { sections: ["summary", "dates", "action_items"] },
        },
      ]),
    );
    vi.spyOn(harness.analysisClient, "requestStructuredOutput").mockImplementationOnce(
      async <T>(request: StructuredRequest<T>): Promise<T> => {
        expect(request.schemaName).toBe("flowpilot_document_chunk_analysis_v1");
        throw new OpenRouterError("PROVIDER_UNAVAILABLE");
      },
    );

    await harness.processor({ executionId, workspaceId, userId });

    expect(harness.attemptCounts.get(testUuid(10))).toBe(1);
    expect(harness.attemptCounts.get(testUuid(11))).toBe(2);
    expect(harness.steps.map((step) => step.status)).toEqual([
      "succeeded",
      "succeeded",
    ]);
    expect(harness.executionStatus()).toBe("succeeded");
  });

  it("does not retry a permanent step failure and marks the execution failed", async () => {
    const harness = createHarness(
      workflow([
        {
          id: "analyze",
          kind: "analyze_document",
          position: { x: 0, y: 0 },
          config: { sections: ["summary"] },
        },
      ]),
    );
    vi.spyOn(harness.analysisClient, "requestStructuredOutput").mockRejectedValue(
      new Error("Permanent validation failure."),
    );

    await harness.processor({ executionId, workspaceId, userId });

    expect(harness.attemptCounts.get(testUuid(10))).toBe(1);
    expect(harness.steps[0]?.status).toBe("failed");
    expect(harness.executionStatus()).toBe("failed");
  });
});

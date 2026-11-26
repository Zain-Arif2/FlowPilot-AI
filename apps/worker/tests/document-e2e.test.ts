import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { WorkflowDefinition } from "@flowpilot/shared";
import type { StructuredRequest } from "@flowpilot/shared/ai/openrouter";
import type { DocumentRepository, ReportRepository } from "@flowpilot/db/repositories";
import type { ReturnTypeOfWorkerStorage } from "../src/adapters/object-storage.js";
import { createDocumentValidationProcessor } from "../src/processors/document.processor.js";
import { createWorkflowExecutionProcessor } from "../src/processors/workflow.processor.js";
import type { DocumentAnalysisClient } from "../src/tools/analyze-document.js";

const userId = "00000000-0000-4000-8000-000000000001";
const workspaceId = "00000000-0000-4000-8000-000000000002";
const documentId = "00000000-0000-4000-8000-000000000003";
const workflowId = "00000000-0000-4000-8000-000000000004";
const reportId = "00000000-0000-4000-8000-000000000005";

const workflowDefinition: WorkflowDefinition = {
  version: 1,
  nodes: [
    { id: "extract", kind: "extract_document", position: { x: 0, y: 0 }, config: {} },
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
      config: { title: "Contract Summary Report" },
    },
  ],
  edges: [
    { id: "e1", source: "extract", target: "analyze" },
    { id: "e2", source: "analyze", target: "report" },
  ],
};

function createE2EHarness(options: { pauseBeforeReportStep?: boolean } = {}) {
  const sourceObjectKey = `workspaces/${workspaceId}/documents/${documentId}/source`;
  const sourceText = "Service agreement effective 2026-12-01. Action: Sign and archive.";
  const objects = new Map<string, Uint8Array>([
    [sourceObjectKey, new TextEncoder().encode(sourceText)],
  ]);

  let documentState: {
    id: string;
    workspaceId: string;
    mediaType: "pdf" | "docx" | "txt";
    byteSize: number;
    status: "validating" | "ready" | "failed";
    sourcePublicId: string;
    textPublicId: string | null;
    checksum: string | null;
    pageCount: number | null;
    textCharacterCount: number | null;
    failureCode: string | null;
  } = {
    id: documentId,
    workspaceId,
    mediaType: "txt",
    byteSize: Buffer.byteLength(sourceText, "utf8"),
    status: "validating",
    sourcePublicId: sourceObjectKey,
    textPublicId: null,
    checksum: null,
    pageCount: null,
    textCharacterCount: null,
    failureCode: null,
  };

  interface StoredStep {
    id: string;
    nodeId: string;
    status: string;
    artifact: { publicId: string } | null;
  }

  interface StoredExecution {
    id: string;
    workflowId: string;
    workflowRevision: number;
    documentId: string | null;
    idempotencyKey: string;
    status: string;
    errorCode: string | null;
    workflowSnapshot: WorkflowDefinition;
    steps: StoredStep[];
  }

  const executions = new Map<string, StoredExecution>();
  const attemptCounts = new Map<string, number>();
  const reports: Array<{ id: string; title: string; content: unknown; sourceExecutionId: string }> = [];
  let pauseBeforeReport = options.pauseBeforeReportStep ?? false;

  const storage: ReturnTypeOfWorkerStorage = {
    async readObject(key) {
      const value = objects.get(key);
      if (!value) throw new Error(`Missing object ${key}`);
      return value;
    },
    async putObject(input) {
      objects.set(input.key, input.body);
    },
    async deleteObject(key) {
      objects.delete(key);
    },
    async deletePrefix(prefix) {
      for (const key of [...objects.keys()]) {
        if (key.startsWith(prefix)) objects.delete(key);
      }
    },
    async uploadAsset(_input) { throw new Error("uploadAsset not used in e2e test"); },
    async inspectAsset(_ref) { return null; },
    createSignedDownloadUrl(_ref, _ttl) { return { url: "http://test", expiresAt: new Date() }; },
    async downloadAsset(_ref, _ttl) { return new Uint8Array(); },
    async deleteAsset(_ref) {},
  };

  const documentRepo = {
    async findById(_context: unknown, requestedId: string) {
      return requestedId === documentId ? { ...documentState } : null;
    },
    async markReady(
      _context: unknown,
      requestedId: string,
      input: {
        readonly checksum: string;
        readonly pageCount: number | null;
        readonly textCharacterCount: number;
        readonly text: {
          readonly publicId: string;
          readonly resourceType: string;
          readonly deliveryType: string;
          readonly format: string;
        };
      },
    ) {
      if (requestedId !== documentId || documentState.status !== "validating") {
        return false;
      }
      documentState = {
        ...documentState,
        status: "ready",
        checksum: input.checksum,
        pageCount: input.pageCount,
        textCharacterCount: input.textCharacterCount,
        textPublicId: input.text.publicId,
        failureCode: null,
      };
      return true;
    },
    async markFailed(_context: unknown, requestedId: string, failureCode: string) {
      if (requestedId !== documentId) return false;
      documentState = { ...documentState, status: "failed", failureCode };
      return true;
    },
  } as unknown as DocumentRepository;

  const analysisClient: DocumentAnalysisClient = {
    async requestStructuredOutput<T>(request: StructuredRequest<T>): Promise<T> {
      return request.validator.parse({
        summary: "Service agreement effective December 1, 2026.",
        dates: ["2026-12-01"],
        actionItems: ["Sign and archive."],
      });
    },
  };
  const requestStructuredOutput = vi.spyOn(analysisClient, "requestStructuredOutput");

  const reportRepo = {
    async create(
      _context: unknown,
      input: Parameters<ReportRepository["create"]>[1],
    ) {
      const existing = reports.find(
        (report) => report.sourceExecutionId === input.sourceExecutionId,
      );
      if (existing) return existing;
      const created = {
        id: reportId,
        title: input.title,
        content: input.content,
        sourceExecutionId: input.sourceExecutionId,
      };
      reports.push(created);
      return created;
    },
  } as unknown as ReportRepository;

  type WorkerExecutions = Parameters<typeof createWorkflowExecutionProcessor>[0]["executions"];

  const executionRepo: WorkerExecutions & {
    createIdempotent(input: {
      workflowId: string;
      workflowRevision: number;
      documentId: string;
      idempotencyKey: string;
    }): StoredExecution;
  } = {
    createIdempotent(input: {
      workflowId: string;
      workflowRevision: number;
      documentId: string;
      idempotencyKey: string;
    }) {
      for (const existing of executions.values()) {
        if (existing.idempotencyKey === input.idempotencyKey) {
          if (
            existing.workflowId !== input.workflowId ||
            existing.workflowRevision !== input.workflowRevision ||
            existing.documentId !== input.documentId
          ) {
            throw new Error("IDEMPOTENCY_KEY_REUSED");
          }
          return existing;
        }
      }
      const id = randomUUID();
      const created: StoredExecution = {
        id,
        workflowId: input.workflowId,
        workflowRevision: input.workflowRevision,
        documentId: input.documentId,
        idempotencyKey: input.idempotencyKey,
        status: "queued",
        errorCode: null,
        workflowSnapshot: workflowDefinition,
        steps: workflowDefinition.nodes.map((node) => ({
          id: randomUUID(),
          nodeId: node.id,
          status: "pending",
          artifact: null,
        })),
      };
      executions.set(id, created);
      return created;
    },
    async startForWorker(_context, executionId) {
      const execution = executions.get(executionId);
      if (!execution || (execution.status !== "queued" && execution.status !== "running")) {
        return false;
      }
      execution.status = "running";
      return true;
    },
    async findForWorker(_context, executionId) {
      const execution = executions.get(executionId);
      if (!execution) return null;
      return {
        ...execution,
        steps: execution.steps.map((step) => ({ ...step })),
      };
    },
    async beginStepAttempt(_context, input) {
      const execution = executions.get(input.executionId);
      const step = execution?.steps.find((candidate) => candidate.id === input.executionStepId);
      if (!step || step.status === "succeeded" || step.status === "waiting_approval") {
        return null;
      }
      if (pauseBeforeReport && step.nodeId === "report") {
        pauseBeforeReport = false;
        return null;
      }
      step.status = "running";
      const attemptNumber = (attemptCounts.get(step.id) ?? 0) + 1;
      attemptCounts.set(step.id, attemptNumber);
      return { attemptId: randomUUID(), attemptNumber };
    },
    async completeStepAttempt(_context, input) {
      const execution = executions.get(input.executionId);
      const step = execution?.steps.find((candidate) => candidate.id === input.executionStepId);
      if (!step) return false;
      step.status = "succeeded";
      step.artifact = { publicId: input.asset.publicId };
      return true;
    },
    async createReportReplacementApproval() {
      return null;
    },
    async failStepAttempt(_context, input) {
      const execution = executions.get(input.executionId);
      const step = execution?.steps.find((candidate) => candidate.id === input.executionStepId);
      if (step) step.status = "failed";
    },
    async finish(_context, input) {
      const execution = executions.get(input.executionId);
      if (!execution) return false;
      execution.status = input.status;
      execution.errorCode = input.errorCode ?? null;
      return true;
    },
  };

  const buildWorkflowProcessor = () =>
    createWorkflowExecutionProcessor({
      executions: executionRepo,
      documents: documentRepo,
      reports: reportRepo,
      workspaces: {
        async isOwner(_userId: string, requestedWorkspaceId: string) {
          return requestedWorkspaceId === workspaceId;
        },
      },
      storage,
      analysisClient,
    });

  return {
    storage,
    documentRepo,
    executionRepo,
    reports,
    executions,
    attemptCounts,
    requestStructuredOutput,
    validateDocument: createDocumentValidationProcessor(documentRepo, storage),
    buildWorkflowProcessor,
    getDocumentState: () => documentState,
  };
}

describe("document workflow end-to-end", () => {
  it("extracts a document, analyzes it, creates a report, and preserves idempotent execution", async () => {
    const harness = createE2EHarness();

    // 1. Validate & extract uploaded document text to private storage.
    await harness.validateDocument({ documentId, workspaceId, userId });
    const readyDoc = harness.getDocumentState();
    expect(readyDoc.status).toBe("ready");
    expect(readyDoc.textPublicId).toBeTruthy();

    // 2. Idempotent execution creation with the same idempotency key returns the same run.
    const firstCreate = harness.executionRepo.createIdempotent({
      workflowId,
      workflowRevision: 1,
      documentId,
      idempotencyKey: "e2e-idempotency-key-0001",
    });
    const duplicateCreate = harness.executionRepo.createIdempotent({
      workflowId,
      workflowRevision: 1,
      documentId,
      idempotencyKey: "e2e-idempotency-key-0001",
    });
    expect(duplicateCreate.id).toBe(firstCreate.id);
    expect(harness.executions.size).toBe(1);

    // 3. Execute workflow and verify report creation.
    const processor = harness.buildWorkflowProcessor();
    await processor({ executionId: firstCreate.id, workspaceId, userId });

    const execution = harness.executions.get(firstCreate.id);
    expect(execution?.status).toBe("succeeded");
    expect(execution?.steps.every((step) => step.status === "succeeded")).toBe(true);
    expect(harness.reports).toHaveLength(1);
    expect(harness.reports[0]?.title).toBe("Contract Summary Report");
    expect(harness.reports[0]?.content).toEqual({
      summary: "Service agreement effective December 1, 2026.",
      dates: ["2026-12-01"],
      actionItems: ["Sign and archive."],
    });

    // 4. Duplicate job delivery does not rerun steps or duplicate the report.
    await processor({ executionId: firstCreate.id, workspaceId, userId });
    expect(harness.reports).toHaveLength(1);
    expect(harness.requestStructuredOutput).toHaveBeenCalledTimes(1);
  });

  it("recovers after worker restart using persisted step artifacts without rerunning completed steps", async () => {
    const harness = createE2EHarness({ pauseBeforeReportStep: true });
    await harness.validateDocument({ documentId, workspaceId, userId });

    const execution = harness.executionRepo.createIdempotent({
      workflowId,
      workflowRevision: 1,
      documentId,
      idempotencyKey: "e2e-idempotency-key-0002",
    });

    // First worker completes extract and analyze, persisting their artifacts, then stops before report.
    const firstWorker = harness.buildWorkflowProcessor();
    await firstWorker({ executionId: execution.id, workspaceId, userId });

    expect(execution.status).toBe("running");
    expect(execution.steps[0]?.status).toBe("succeeded");
    expect(execution.steps[1]?.status).toBe("succeeded");
    expect(execution.steps[0]?.artifact?.publicId).toBeTruthy();
    expect(execution.steps[1]?.artifact?.publicId).toBeTruthy();
    expect(execution.steps[2]?.status).toBe("pending");
    expect(harness.reports).toHaveLength(0);
    expect(harness.requestStructuredOutput).toHaveBeenCalledTimes(1);

    // Simulate worker restart with a fresh processor instance.
    const restartedWorker = harness.buildWorkflowProcessor();
    await restartedWorker({ executionId: execution.id, workspaceId, userId });

    expect(execution.status).toBe("succeeded");
    expect(execution.steps.every((step) => step.status === "succeeded")).toBe(true);
    // Completed extract and analyze steps were NOT rerun; their persisted artifacts were reused.
    expect(harness.requestStructuredOutput).toHaveBeenCalledTimes(1);
    expect(harness.attemptCounts.get(execution.steps[0]?.id ?? "")).toBe(1);
    expect(harness.attemptCounts.get(execution.steps[1]?.id ?? "")).toBe(1);
    expect(harness.attemptCounts.get(execution.steps[2]?.id ?? "")).toBe(1);
    expect(harness.reports).toHaveLength(1);
  });
});

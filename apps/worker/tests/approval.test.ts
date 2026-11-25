import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@flowpilot/db/client";
import { createApprovalRepository } from "@flowpilot/db/repositories";
import type { WorkflowDefinition } from "@flowpilot/shared";
import type { StructuredRequest } from "@flowpilot/shared/ai/openrouter";
import type { Queue } from "bullmq";
import { createOutboxProcessor } from "../src/outbox/processor.js";
import { createWorkflowExecutionProcessor } from "../src/processors/workflow.processor.js";
import type {
  CleanupJob,
  DocumentValidationJob,
  WorkflowExecutionJob,
} from "../src/queue/contracts.js";
import type { DocumentAnalysisClient } from "../src/tools/analyze-document.js";

const userId = "00000000-0000-4000-8000-000000000001";
const workspaceId = "00000000-0000-4000-8000-000000000002";
const documentId = "00000000-0000-4000-8000-000000000003";
const executionId = "00000000-0000-4000-8000-000000000004";
const targetReportId = "00000000-0000-4000-8000-000000000005";

const originalReportContent = {
  summary: "Original summary.",
  dates: ["2026-01-15"],
  actionItems: ["Keep existing report."],
};

const proposedReportContent = {
  summary: "Updated replacement summary.",
  dates: ["2026-12-01"],
  actionItems: ["Publish replacement after approval."],
};

const replacementWorkflow: WorkflowDefinition = {
  version: 1,
  nodes: [
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
      config: { reportId: targetReportId },
    },
  ],
  edges: [{ id: "e1", source: "analyze", target: "replace" }],
};

interface ApprovalRecord {
  id: string;
  workspaceId: string;
  executionId: string;
  executionStepId: string;
  actionType: "replace_report";
  targetReportId: string;
  expectedReportRevision: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  requestedAt: Date;
  decidedAt: Date | null;
  decidedById: string | null;
}

interface PendingReportRecord {
  id: string;
  workspaceId: string;
  approvalId: string;
  reportId: string;
  sourceDocumentId: string;
  expectedReportRevision: number;
  proposedContent: unknown;
}

interface OutboxRecord {
  id: string;
  eventKey: string;
  eventType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

function createApprovalHarness() {
  const report = {
    id: targetReportId,
    workspaceId,
    revision: 1,
    content: structuredClone(originalReportContent),
  };
  const execution = {
    id: executionId,
    workspaceId,
    status: "queued" as
      | "queued"
      | "running"
      | "waiting_approval"
      | "succeeded"
      | "failed"
      | "cancelled",
    documentId,
    errorCode: null as string | null,
    finishedAt: null as Date | null,
    workflowSnapshot: replacementWorkflow,
  };
  const steps = replacementWorkflow.nodes.map((node) => ({
    id: randomUUID(),
    workspaceId,
    executionId,
    nodeId: node.id,
    status: "pending" as
      | "pending"
      | "running"
      | "waiting_approval"
      | "succeeded"
      | "failed"
      | "skipped",
    artifact: null as { objectKey: string } | null,
  }));

  const approvals: ApprovalRecord[] = [];
  const pendingReports: PendingReportRecord[] = [];
  const executionEvents: Array<{
    workspaceId: string;
    executionId: string;
    executionStepId?: string;
    eventType: string;
    safeDetails: Record<string, unknown>;
  }> = [];
  const outboxEvents: OutboxRecord[] = [];
  const attemptCounts = new Map<string, number>();
  const objects = new Map<string, Uint8Array>([
    ["doc-text", new TextEncoder().encode("Document text for replacement.")],
  ]);

  const tx = {
    async $executeRaw() {
      return 0;
    },
    workspace: {
      async findFirst(args: { where: { id: string; ownerId: string } }) {
        return args.where.id === workspaceId && args.where.ownerId === userId
          ? { id: workspaceId }
          : null;
      },
    },
    approval: {
      async findFirst(args: { where: { id: string; workspaceId: string } }) {
        const record = approvals.find(
          (item) =>
            item.id === args.where.id &&
            item.workspaceId === args.where.workspaceId,
        );
        if (!record) return null;
        const pendingReport =
          pendingReports.find((item) => item.approvalId === record.id) ?? null;
        const step = steps.find((item) => item.id === record.executionStepId);
        return {
          ...record,
          pendingReport,
          execution: { status: execution.status },
          executionStep: { status: step?.status ?? "pending" },
        };
      },
      async findFirstOrThrow(args: { where: { id: string; workspaceId: string } }) {
        const found = await tx.approval.findFirst(args);
        if (!found) throw new Error("Approval not found");
        return found;
      },
      async updateMany(args: {
        where: { id: string; workspaceId: string; status: string };
        data: Partial<ApprovalRecord>;
      }) {
        const target = approvals.find(
          (item) =>
            item.id === args.where.id &&
            item.workspaceId === args.where.workspaceId &&
            item.status === args.where.status,
        );
        if (!target) return { count: 0 };
        Object.assign(target, args.data);
        return { count: 1 };
      },
    },
    report: {
      async updateMany(args: {
        where: { id: string; workspaceId: string; revision: number };
        data: { content: unknown; revision: { increment: number } };
      }) {
        if (
          report.id !== args.where.id ||
          report.workspaceId !== args.where.workspaceId ||
          report.revision !== args.where.revision
        ) {
          return { count: 0 };
        }
        report.content = args.data.content as typeof originalReportContent;
        report.revision += args.data.revision.increment;
        return { count: 1 };
      },
    },
    pendingReport: {
      async delete(args: {
        where: { workspaceId_approvalId: { workspaceId: string; approvalId: string } };
      }) {
        const index = pendingReports.findIndex(
          (item) =>
            item.workspaceId === args.where.workspaceId_approvalId.workspaceId &&
            item.approvalId === args.where.workspaceId_approvalId.approvalId,
        );
        if (index < 0) throw new Error("PendingReport not found");
        const [removed] = pendingReports.splice(index, 1);
        return removed;
      },
    },
    execution: {
      async updateMany(args: {
        where: { id: string; workspaceId: string; status: string };
        data: Partial<typeof execution>;
      }) {
        if (
          execution.id !== args.where.id ||
          execution.workspaceId !== args.where.workspaceId ||
          execution.status !== args.where.status
        ) {
          return { count: 0 };
        }
        Object.assign(execution, args.data);
        return { count: 1 };
      },
    },
    executionStep: {
      async updateMany(args: {
        where: { id: string; workspaceId: string; status: string };
        data: Partial<(typeof steps)[number]>;
      }) {
        const step = steps.find(
          (item) =>
            item.id === args.where.id &&
            item.workspaceId === args.where.workspaceId &&
            item.status === args.where.status,
        );
        if (!step) return { count: 0 };
        Object.assign(step, args.data);
        return { count: 1 };
      },
    },
    executionEvent: {
      async createMany(args: { data: typeof executionEvents }) {
        executionEvents.push(...args.data);
        return { count: args.data.length };
      },
    },
    outboxEvent: {
      async create(args: { data: Omit<OutboxRecord, "id"> }) {
        const record = { id: randomUUID(), ...args.data };
        outboxEvents.push(record);
        return record;
      },
    },
  };

  const prisma = {
    async $transaction<T>(fn: (transaction: typeof tx) => Promise<T>) {
      return fn(tx);
    },
    outboxEvent: {
      async findUnique(args: { where: { id: string } }) {
        return outboxEvents.find((item) => item.id === args.where.id) ?? null;
      },
    },
  } as unknown as PrismaClient;

  const analysisClient: DocumentAnalysisClient = {
    async requestStructuredOutput<T>(request: StructuredRequest<T>): Promise<T> {
      return request.validator.parse(proposedReportContent);
    },
  };

  type WorkerExecutions = Parameters<typeof createWorkflowExecutionProcessor>[0]["executions"];
  const workerExecutions: WorkerExecutions = {
    async startForWorker() {
      if (execution.status !== "queued" && execution.status !== "running") {
        return false;
      }
      execution.status = "running";
      return true;
    },
    async findForWorker() {
      return {
        id: execution.id,
        status: execution.status,
        documentId: execution.documentId,
        workflowSnapshot: execution.workflowSnapshot,
        steps: steps.map((step) => ({ ...step })),
      };
    },
    async beginStepAttempt(_context, input) {
      const step = steps.find((candidate) => candidate.id === input.executionStepId);
      if (!step || step.status === "succeeded" || step.status === "waiting_approval") {
        return null;
      }
      step.status = "running";
      const attemptNumber = (attemptCounts.get(step.id) ?? 0) + 1;
      attemptCounts.set(step.id, attemptNumber);
      return { attemptId: randomUUID(), attemptNumber };
    },
    async completeStepAttempt(_context, input) {
      const step = steps.find((candidate) => candidate.id === input.executionStepId);
      if (!step) return false;
      step.status = "succeeded";
      step.artifact = { objectKey: input.objectKey };
      return true;
    },
    async createReportReplacementApproval(_context, input) {
      const step = steps.find((candidate) => candidate.id === input.executionStepId);
      if (!step) return null;
      const approvalId = randomUUID();
      const pendingId = randomUUID();
      approvals.push({
        id: approvalId,
        workspaceId,
        executionId: input.executionId,
        executionStepId: input.executionStepId,
        actionType: "replace_report",
        targetReportId: input.targetReportId,
        expectedReportRevision: report.revision,
        status: "pending",
        requestedAt: new Date(),
        decidedAt: null,
        decidedById: null,
      });
      pendingReports.push({
        id: pendingId,
        workspaceId,
        approvalId,
        reportId: input.targetReportId,
        sourceDocumentId: input.sourceDocumentId,
        expectedReportRevision: report.revision,
        proposedContent: input.proposedContent,
      });
      step.status = "waiting_approval";
      step.artifact = { objectKey: input.objectKey };
      execution.status = "waiting_approval";
      return { approvalId };
    },
    async failStepAttempt(_context, input) {
      const step = steps.find((candidate) => candidate.id === input.executionStepId);
      if (step) step.status = "failed";
    },
    async finish(_context, input) {
      execution.status = input.status;
      execution.errorCode = input.errorCode ?? null;
      return true;
    },
  };

  const workflowQueueAdd = vi.fn(async () => ({}));
  const cleanupQueueAdd = vi.fn(async () => ({}));
  const outboxProcessor = createOutboxProcessor(prisma, {
    workflowQueue: { add: workflowQueueAdd } as unknown as Queue<WorkflowExecutionJob>,
    documentQueue: { add: vi.fn(async () => ({})) } as unknown as Queue<DocumentValidationJob>,
    cleanupQueue: { add: cleanupQueueAdd } as unknown as Queue<CleanupJob>,
  });

  const workflowProcessor = createWorkflowExecutionProcessor({
    executions: workerExecutions,
    documents: {
      async findById() {
        return { id: documentId, status: "ready", textObjectKey: "doc-text" };
      },
    },
    reports: {
      async create() {
        throw new Error("create_report should not run for replace_report");
      },
    },
    workspaces: {
      async isOwner(_userId, requestedWorkspaceId) {
        return requestedWorkspaceId === workspaceId;
      },
    },
    storage: {
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
    },
    analysisClient,
  });

  return {
    report,
    execution,
    steps,
    approvals,
    pendingReports,
    executionEvents,
    outboxEvents,
    attemptCounts,
    approvalRepo: createApprovalRepository(prisma),
    outboxProcessor,
    workflowProcessor,
    workflowQueueAdd,
    cleanupQueueAdd,
  };
}

describe("approval workflow integration", () => {
  it("pauses on replace_report without modifying the existing report", async () => {
    const harness = createApprovalHarness();

    await harness.workflowProcessor({ executionId, workspaceId, userId });

    expect(harness.execution.status).toBe("waiting_approval");
    expect(harness.steps[0]?.status).toBe("succeeded");
    expect(harness.steps[1]?.status).toBe("waiting_approval");
    expect(harness.approvals).toHaveLength(1);
    expect(harness.approvals[0]).toMatchObject({
      status: "pending",
      targetReportId,
      expectedReportRevision: 1,
    });
    expect(harness.pendingReports).toHaveLength(1);
    expect(harness.report.revision).toBe(1);
    expect(harness.report.content).toEqual(originalReportContent);
  });

  it("replaces the report on owner approval and continues execution without repeating completed steps", async () => {
    const harness = createApprovalHarness();
    await harness.workflowProcessor({ executionId, workspaceId, userId });

    const approvalId = harness.approvals[0]?.id ?? "";
    const result = await harness.approvalRepo.decide(
      { userId, workspaceId },
      { approvalId, decision: "approved" },
    );

    expect(result.kind).toBe("decided");
    expect(harness.approvals[0]?.status).toBe("approved");
    expect(harness.pendingReports).toHaveLength(0);
    expect(harness.report.revision).toBe(2);
    expect(harness.report.content).toEqual(proposedReportContent);
    expect(harness.execution.status).toBe("running");
    expect(harness.steps[1]?.status).toBe("succeeded");
    expect(harness.outboxEvents[0]?.eventType).toBe("execution.continue");

    await harness.outboxProcessor({ outboxEventId: harness.outboxEvents[0]?.id ?? "" });
    expect(harness.workflowQueueAdd).toHaveBeenCalledWith(
      "execution.continue",
      { executionId, workspaceId, userId },
      expect.any(Object),
    );

    await harness.workflowProcessor({ executionId, workspaceId, userId });
    expect(harness.execution.status).toBe("succeeded");
    expect(harness.attemptCounts.get(harness.steps[0]?.id ?? "")).toBe(1);
    expect(harness.attemptCounts.get(harness.steps[1]?.id ?? "")).toBe(1);
  });

  it("cancels execution and discards pending content on rejection without replacing the report", async () => {
    const harness = createApprovalHarness();
    await harness.workflowProcessor({ executionId, workspaceId, userId });

    const approvalId = harness.approvals[0]?.id ?? "";
    const result = await harness.approvalRepo.decide(
      { userId, workspaceId },
      { approvalId, decision: "rejected" },
    );

    expect(result.kind).toBe("decided");
    expect(harness.approvals[0]?.status).toBe("rejected");
    expect(harness.execution.status).toBe("cancelled");
    expect(harness.steps[1]?.status).toBe("skipped");
    expect(harness.pendingReports).toHaveLength(0);
    expect(harness.report.revision).toBe(1);
    expect(harness.report.content).toEqual(originalReportContent);
    expect(harness.outboxEvents[0]?.eventType).toBe("execution.artifact.cleanup");

    await harness.outboxProcessor({ outboxEventId: harness.outboxEvents[0]?.id ?? "" });
    expect(harness.cleanupQueueAdd).toHaveBeenCalledWith(
      "execution.artifact.cleanup",
      { cleanupType: "execution_artifacts", aggregateId: executionId, workspaceId, userId },
      expect.any(Object),
    );
  });

  it("cancels approval and execution on stale revision conflict while leaving the report unchanged", async () => {
    const harness = createApprovalHarness();
    await harness.workflowProcessor({ executionId, workspaceId, userId });

    // Target report advances to revision 2 before the owner decides.
    harness.report.revision = 2;
    const approvalId = harness.approvals[0]?.id ?? "";
    const result = await harness.approvalRepo.decide(
      { userId, workspaceId },
      { approvalId, decision: "approved" },
    );

    expect(result).toEqual({ kind: "stale" });
    expect(harness.approvals[0]?.status).toBe("cancelled");
    expect(harness.execution.status).toBe("cancelled");
    expect(harness.execution.errorCode).toBe("STALE_REPORT_REVISION");
    expect(harness.steps[1]?.status).toBe("skipped");
    expect(harness.pendingReports).toHaveLength(0);
    expect(harness.report.revision).toBe(2);
    expect(harness.report.content).toEqual(originalReportContent);
    expect(harness.outboxEvents[0]?.eventType).toBe("execution.artifact.cleanup");
  });
});

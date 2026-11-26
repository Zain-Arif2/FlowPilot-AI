import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  createApprovalRepository,
  createDocumentRepository,
  createExecutionArtifactRepository,
  createExecutionHistoryRepository,
  createReportRepository,
} from "@flowpilot/db/repositories";
import { TenantAccessError } from "@flowpilot/db/tenant-transaction";
import { createPrivateObjectKey } from "../src/adapters/object-storage.js";
import { HttpError } from "../src/errors/api-error.js";
import { createApprovalService } from "../src/modules/approvals/service.js";
import { createDocumentService } from "../src/modules/documents/service.js";
import { createExecutionHistoryService } from "../src/modules/executions/history.js";
import { createReportService } from "../src/modules/reports/service.js";

const ownerId = "00000000-0000-4000-8000-000000000001";
const attackerId = "00000000-0000-4000-8000-000000000002";
const workspaceId = "00000000-0000-4000-8000-000000000011";
const workflowId = "00000000-0000-4000-8000-000000000021";
const documentId = "00000000-0000-4000-8000-000000000031";
const reportId = "00000000-0000-4000-8000-000000000041";
const completedExecutionId = "00000000-0000-4000-8000-000000000051";
const waitingExecutionId = "00000000-0000-4000-8000-000000000052";
const pendingStepId = "00000000-0000-4000-8000-000000000061";
const completedStepId = "00000000-0000-4000-8000-000000000062";
const pendingReportId = "00000000-0000-4000-8000-000000000071";
const approvalId = "00000000-0000-4000-8000-000000000081";

const sensitiveDocumentText = "CONFIDENTIAL_BOARD_MEMO_RAW_TEXT";
const sensitiveReportSummary = "CONFIDENTIAL_REPORT_SUMMARY_BODY";
const sensitivePendingSummary = "CONFIDENTIAL_PENDING_REPLACEMENT_BODY";
const sensitiveActionItem = "CONFIDENTIAL_ACTION_ITEM_MERGE_NOW";

interface DocumentRow {
  id: string;
  workspaceId: string;
  uploadedById: string;
  originalName: string;
  mediaType: "pdf" | "docx" | "txt";
  byteSize: number;
  pageCount: number | null;
  textCharacterCount: number | null;
  status: "uploading" | "validating" | "ready" | "failed" | "deleting";
  failureCode: string | null;
  sourcePublicId: string;
  sourceResourceType: string;
  sourceDeliveryType: string;
  sourceFormat: string;
  textPublicId: string | null;
  checksum: string | null;
  createdAt: Date;
}

interface ReportRow {
  id: string;
  workspaceId: string;
  sourceDocumentId: string | null;
  sourceExecutionId: string;
  title: string;
  revision: number;
  content: unknown;
  updatedAt: Date;
}

interface PendingReportRow {
  id: string;
  workspaceId: string;
  reportId: string;
  sourceDocumentId: string | null;
  proposedContent: unknown;
}

interface ApprovalRow {
  id: string;
  workspaceId: string;
  executionId: string;
  executionStepId: string;
  actionType: "replace_report";
  targetReportId: string;
  pendingReportId: string;
  expectedReportRevision: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  requestedAt: Date;
  decidedAt: Date | null;
}

interface ExecutionRow {
  id: string;
  workspaceId: string;
  workflowId: string;
  documentId: string | null;
  status: "queued" | "running" | "waiting_approval" | "succeeded" | "failed" | "cancelled";
  createdAt: Date;
  finishedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
}

interface ExecutionStepRow {
  id: string;
  workspaceId: string;
  executionId: string;
  nodeId: string;
  actionType: string;
  status: "pending" | "running" | "waiting_approval" | "succeeded" | "failed" | "skipped";
  createdAt: Date;
}

interface StepAttemptRow {
  id: string;
  workspaceId: string;
  executionStepId: string;
  attemptNumber: number;
  status: "running" | "succeeded" | "failed";
  startedAt: Date;
  finishedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
}

interface ExecutionEventRow {
  id: string;
  workspaceId: string;
  executionId: string;
  executionStepId: string | null;
  eventType: string;
  safeDetails: Record<string, unknown>;
  createdAt: Date;
}

interface ExecutionArtifactRow {
  id: string;
  workspaceId: string;
  executionId: string;
  sourceDocumentId: string | null;
  publicId: string;
  resourceType: string;
  deliveryType: string;
  format: string;
}

interface OutboxEventRow {
  eventKey: string;
  eventType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

function createInMemoryDeletionHarness() {
  const sourceKey = createPrivateObjectKey(workspaceId, documentId, "source");
  const textKey = createPrivateObjectKey(workspaceId, documentId, "text");
  const artifactKeyOne = `workspaces/${workspaceId}/executions/${waitingExecutionId}/extract.json`;
  const artifactKeyTwo = `workspaces/${workspaceId}/executions/${completedExecutionId}/analyze.json`;

  const objectStore = new Map<string, string>([
    [sourceKey, sensitiveDocumentText],
    [textKey, sensitiveDocumentText],
    [artifactKeyOne, JSON.stringify({ text: sensitiveDocumentText })],
    [artifactKeyTwo, JSON.stringify({ summary: sensitiveReportSummary })],
  ]);

  const workspaces = [{ id: workspaceId, ownerId }];
  const documents: DocumentRow[] = [
    {
      id: documentId,
      workspaceId,
      uploadedById: ownerId,
      originalName: "board-memo.pdf",
      mediaType: "pdf",
      byteSize: 2048,
      pageCount: 2,
      textCharacterCount: sensitiveDocumentText.length,
      status: "ready",
      failureCode: null,
      sourcePublicId: sourceKey,
      sourceResourceType: "raw",
      sourceDeliveryType: "authenticated",
      sourceFormat: "pdf",
      textPublicId: textKey,
      checksum: "sha256-test",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  ];
  const reports: ReportRow[] = [
    {
      id: reportId,
      workspaceId,
      sourceDocumentId: documentId,
      sourceExecutionId: completedExecutionId,
      title: "Board Memo Report",
      revision: 1,
      content: {
        summary: sensitiveReportSummary,
        dates: ["2026-02-01"],
        actionItems: [sensitiveActionItem],
      },
      updatedAt: new Date("2026-01-01T00:05:00.000Z"),
    },
  ];
  const pendingReports: PendingReportRow[] = [
    {
      id: pendingReportId,
      workspaceId,
      reportId,
      sourceDocumentId: documentId,
      proposedContent: {
        summary: sensitivePendingSummary,
        dates: ["2026-03-01"],
        actionItems: [sensitiveActionItem],
      },
    },
  ];
  const approvals: ApprovalRow[] = [
    {
      id: approvalId,
      workspaceId,
      executionId: waitingExecutionId,
      executionStepId: pendingStepId,
      actionType: "replace_report",
      targetReportId: reportId,
      pendingReportId,
      expectedReportRevision: 1,
      status: "pending",
      requestedAt: new Date("2026-01-01T00:10:00.000Z"),
      decidedAt: null,
    },
  ];
  const executions: ExecutionRow[] = [
    {
      id: completedExecutionId,
      workspaceId,
      workflowId,
      documentId,
      status: "succeeded",
      createdAt: new Date("2026-01-01T00:01:00.000Z"),
      finishedAt: new Date("2026-01-01T00:05:00.000Z"),
      errorCode: null,
      errorMessage: null,
    },
    {
      id: waitingExecutionId,
      workspaceId,
      workflowId,
      documentId,
      status: "waiting_approval",
      createdAt: new Date("2026-01-01T00:06:00.000Z"),
      finishedAt: null,
      errorCode: null,
      errorMessage: null,
    },
  ];
  const executionSteps: ExecutionStepRow[] = [
    {
      id: completedStepId,
      workspaceId,
      executionId: completedExecutionId,
      nodeId: "create_report",
      actionType: "create_report",
      status: "succeeded",
      createdAt: new Date("2026-01-01T00:02:00.000Z"),
    },
    {
      id: pendingStepId,
      workspaceId,
      executionId: waitingExecutionId,
      nodeId: "replace_report",
      actionType: "replace_report",
      status: "waiting_approval",
      createdAt: new Date("2026-01-01T00:07:00.000Z"),
    },
  ];
  const stepAttempts: StepAttemptRow[] = [
    {
      id: "00000000-0000-4000-8000-000000000091",
      workspaceId,
      executionStepId: completedStepId,
      attemptNumber: 1,
      status: "succeeded",
      startedAt: new Date("2026-01-01T00:02:00.000Z"),
      finishedAt: new Date("2026-01-01T00:03:00.000Z"),
      errorCode: null,
      errorMessage: null,
    },
    {
      id: "00000000-0000-4000-8000-000000000092",
      workspaceId,
      executionStepId: pendingStepId,
      attemptNumber: 1,
      status: "running",
      startedAt: new Date("2026-01-01T00:07:00.000Z"),
      finishedAt: null,
      errorCode: null,
      errorMessage: null,
    },
  ];
  const executionEvents: ExecutionEventRow[] = [
    {
      id: "00000000-0000-4000-8000-000000000101",
      workspaceId,
      executionId: completedExecutionId,
      executionStepId: completedStepId,
      eventType: "execution_step.state_changed",
      safeDetails: { state: "succeeded" },
      createdAt: new Date("2026-01-01T00:03:00.000Z"),
    },
  ];
  const executionArtifacts: ExecutionArtifactRow[] = [
    {
      id: "00000000-0000-4000-8000-000000000111",
      workspaceId,
      executionId: waitingExecutionId,
      sourceDocumentId: documentId,
      publicId: artifactKeyOne,
      resourceType: "raw",
      deliveryType: "authenticated",
      format: "json",
    },
    {
      id: "00000000-0000-4000-8000-000000000112",
      workspaceId,
      executionId: completedExecutionId,
      sourceDocumentId: documentId,
      publicId: artifactKeyTwo,
      resourceType: "raw",
      deliveryType: "authenticated",
      format: "json",
    },
  ];
  const outboxEvents: OutboxEventRow[] = [];

  const matchesIn = (value: string | null, filter?: { in?: string[] }): boolean => {
    if (!filter?.in) return true;
    return value !== null && filter.in.includes(value);
  };

  const tx = {
    async $executeRaw() {
      return 0;
    },
    workspace: {
      async findFirst(args: { where: { id: string; ownerId: string } }) {
        return (
          workspaces.find(
            (item) =>
              item.id === args.where.id && item.ownerId === args.where.ownerId,
          ) ?? null
        );
      },
    },
    document: {
      async findMany(args: { where: { workspaceId: string } }) {
        return documents.filter(
          (item) => item.workspaceId === args.where.workspaceId,
        );
      },
      async findFirst(args: { where: { id: string; workspaceId: string } }) {
        return (
          documents.find(
            (item) =>
              item.id === args.where.id &&
              item.workspaceId === args.where.workspaceId,
          ) ?? null
        );
      },
      async update(args: {
        where: { id: string };
        data: Partial<DocumentRow>;
      }) {
        const target = documents.find((item) => item.id === args.where.id);
        if (!target) throw new Error("Document not found");
        Object.assign(target, args.data);
        return target;
      },
      async deleteMany(args: {
        where: { id: string; workspaceId: string; status: DocumentRow["status"] };
      }) {
        let count = 0;
        for (let index = documents.length - 1; index >= 0; index -= 1) {
          const item = documents[index];
          if (
            item &&
            item.id === args.where.id &&
            item.workspaceId === args.where.workspaceId &&
            item.status === args.where.status
          ) {
            documents.splice(index, 1);
            count += 1;
          }
        }
        return { count };
      },
    },
    report: {
      async findMany(args: {
        where: { workspaceId: string; sourceDocumentId?: string };
      }) {
        return reports.filter(
          (item) =>
            item.workspaceId === args.where.workspaceId &&
            (args.where.sourceDocumentId === undefined ||
              item.sourceDocumentId === args.where.sourceDocumentId),
        );
      },
      async findFirst(args: { where: { id: string; workspaceId: string } }) {
        return (
          reports.find(
            (item) =>
              item.id === args.where.id &&
              item.workspaceId === args.where.workspaceId,
          ) ?? null
        );
      },
      async deleteMany(args: {
        where: { workspaceId: string; sourceDocumentId: string };
      }) {
        let count = 0;
        for (let index = reports.length - 1; index >= 0; index -= 1) {
          const item = reports[index];
          if (
            item &&
            item.workspaceId === args.where.workspaceId &&
            item.sourceDocumentId === args.where.sourceDocumentId
          ) {
            reports.splice(index, 1);
            count += 1;
          }
        }
        return { count };
      },
    },
    pendingReport: {
      async deleteMany(args: {
        where: {
          workspaceId: string;
          OR: Array<{ sourceDocumentId?: string; reportId?: { in: string[] } }>;
        };
      }) {
        let count = 0;
        for (let index = pendingReports.length - 1; index >= 0; index -= 1) {
          const item = pendingReports[index];
          if (!item || item.workspaceId !== args.where.workspaceId) continue;
          const matches = args.where.OR.some(
            (clause) =>
              (clause.sourceDocumentId !== undefined &&
                item.sourceDocumentId === clause.sourceDocumentId) ||
              (clause.reportId !== undefined &&
                clause.reportId.in.includes(item.reportId)),
          );
          if (matches) {
            pendingReports.splice(index, 1);
            count += 1;
          }
        }
        return { count };
      },
    },
    approval: {
      async findMany(args: {
        where: {
          workspaceId: string;
          status?: ApprovalRow["status"];
          OR?: Array<{
            pendingReport?: { sourceDocumentId: string };
            targetReportId?: { in: string[] };
          }>;
        };
      }) {
        return approvals.filter((item) => {
          if (item.workspaceId !== args.where.workspaceId) return false;
          if (args.where.status && item.status !== args.where.status) return false;
          if (!args.where.OR) return true;
          return args.where.OR.some((clause) => {
            if (clause.pendingReport) {
              const linked = pendingReports.find(
                (pending) => pending.id === item.pendingReportId,
              );
              return (
                linked?.sourceDocumentId === clause.pendingReport.sourceDocumentId
              );
            }
            if (clause.targetReportId) {
              return clause.targetReportId.in.includes(item.targetReportId);
            }
            return false;
          });
        });
      },
      async findFirst(args: { where: { id: string; workspaceId: string } }) {
        const approval = approvals.find(
          (item) =>
            item.id === args.where.id &&
            item.workspaceId === args.where.workspaceId,
        );
        if (!approval) return null;
        const pendingReport =
          pendingReports.find((item) => item.id === approval.pendingReportId) ??
          null;
        return {
          ...approval,
          pendingReport: pendingReport
            ? { proposedContent: pendingReport.proposedContent }
            : null,
        };
      },
      async updateMany(args: {
        where: { workspaceId: string; id: { in: string[] } };
        data: Partial<ApprovalRow>;
      }) {
        let count = 0;
        for (const item of approvals) {
          if (
            item.workspaceId === args.where.workspaceId &&
            args.where.id.in.includes(item.id)
          ) {
            Object.assign(item, args.data);
            count += 1;
          }
        }
        return { count };
      },
      async deleteMany(args: {
        where: { workspaceId: string; targetReportId: { in: string[] } };
      }) {
        let count = 0;
        for (let index = approvals.length - 1; index >= 0; index -= 1) {
          const item = approvals[index];
          if (
            item &&
            item.workspaceId === args.where.workspaceId &&
            args.where.targetReportId.in.includes(item.targetReportId)
          ) {
            approvals.splice(index, 1);
            count += 1;
          }
        }
        return { count };
      },
    },
    execution: {
      async findMany(args: {
        where: {
          workspaceId: string;
          documentId?: string;
          status?: { in: string[] };
        };
      }) {
        return executions.filter(
          (item) =>
            item.workspaceId === args.where.workspaceId &&
            (args.where.documentId === undefined ||
              item.documentId === args.where.documentId) &&
            matchesIn(item.status, args.where.status),
        );
      },
      async findFirst(args: { where: { id: string; workspaceId: string } }) {
        const execution = executions.find(
          (item) =>
            item.id === args.where.id &&
            item.workspaceId === args.where.workspaceId,
        );
        if (!execution) return null;
        const steps = executionSteps
          .filter((step) => step.executionId === execution.id)
          .map((step) => ({
            ...step,
            attempts: stepAttempts.filter(
              (attempt) => attempt.executionStepId === step.id,
            ),
          }));
        const events = executionEvents
          .filter((event) => event.executionId === execution.id)
          .map((event) => {
            const linkedStep = executionSteps.find(
              (step) => step.id === event.executionStepId,
            );
            return {
              ...event,
              executionStep: linkedStep ? { nodeId: linkedStep.nodeId } : null,
            };
          });
        return { ...execution, steps, events };
      },
      async updateMany(args: {
        where: {
          workspaceId: string;
          id?: { in: string[] };
          documentId?: string;
          status?: { in: string[] };
        };
        data: Partial<ExecutionRow>;
      }) {
        let count = 0;
        for (const item of executions) {
          if (item.workspaceId !== args.where.workspaceId) continue;
          if (args.where.id && !args.where.id.in.includes(item.id)) continue;
          if (
            args.where.documentId !== undefined &&
            item.documentId !== args.where.documentId
          ) {
            continue;
          }
          if (!matchesIn(item.status, args.where.status)) continue;
          Object.assign(item, args.data);
          count += 1;
        }
        return { count };
      },
    },
    executionStep: {
      async updateMany(args: {
        where: {
          workspaceId: string;
          executionId: { in: string[] };
          status: { in: string[] };
        };
        data: Partial<ExecutionStepRow>;
      }) {
        let count = 0;
        for (const item of executionSteps) {
          if (
            item.workspaceId === args.where.workspaceId &&
            args.where.executionId.in.includes(item.executionId) &&
            matchesIn(item.status, args.where.status)
          ) {
            Object.assign(item, args.data);
            count += 1;
          }
        }
        return { count };
      },
    },
    stepAttempt: {
      async updateMany(args: {
        where: {
          workspaceId: string;
          executionStep: { executionId: { in: string[] } };
          status: string;
        };
        data: Partial<StepAttemptRow>;
      }) {
        let count = 0;
        for (const item of stepAttempts) {
          const step = executionSteps.find(
            (candidate) => candidate.id === item.executionStepId,
          );
          if (
            item.workspaceId === args.where.workspaceId &&
            step &&
            args.where.executionStep.executionId.in.includes(step.executionId) &&
            item.status === args.where.status
          ) {
            Object.assign(item, args.data);
            count += 1;
          }
        }
        return { count };
      },
    },
    executionEvent: {
      async create(args: {
        data: Omit<ExecutionEventRow, "id" | "createdAt">;
      }) {
        const created: ExecutionEventRow = {
          id: `00000000-0000-4000-8000-0000000002${executionEvents.length}`,
          workspaceId: args.data.workspaceId,
          executionId: args.data.executionId,
          executionStepId: args.data.executionStepId ?? null,
          eventType: args.data.eventType,
          safeDetails: args.data.safeDetails,
          createdAt: new Date("2026-01-01T00:15:00.000Z"),
        };
        executionEvents.push(created);
        return created;
      },
    },
    executionArtifact: {
      async findMany(args: {
        where: { workspaceId: string; sourceDocumentId: string };
      }) {
        return executionArtifacts.filter(
          (item) =>
            item.workspaceId === args.where.workspaceId &&
            item.sourceDocumentId === args.where.sourceDocumentId,
        );
      },
      async deleteMany(args: {
        where: { workspaceId: string; sourceDocumentId: string };
      }) {
        let count = 0;
        for (let index = executionArtifacts.length - 1; index >= 0; index -= 1) {
          const item = executionArtifacts[index];
          if (
            item &&
            item.workspaceId === args.where.workspaceId &&
            item.sourceDocumentId === args.where.sourceDocumentId
          ) {
            executionArtifacts.splice(index, 1);
            count += 1;
          }
        }
        return { count };
      },
    },
    outboxEvent: {
      async create(args: { data: OutboxEventRow }) {
        outboxEvents.push(args.data);
        return args.data;
      },
    },
  };

  const prisma = {
    async $transaction<T>(fn: (transaction: typeof tx) => Promise<T>) {
      return fn(tx);
    },
  } as unknown as PrismaClient;

  const storage = {
    async createUploadUrl() {
      throw new Error("Not used in deletion test.");
    },
    async headObject() {
      return null;
    },
    async uploadAsset(_input: unknown) {
      throw new Error("Not used in deletion test.");
    },
    async inspectAsset(_ref: unknown) {
      return null;
    },
    async deleteAsset(_ref: unknown) {},
    async deletePrefix(prefix: string) {
      for (const key of [...objectStore.keys()]) {
        if (key.startsWith(prefix)) objectStore.delete(key);
      }
    },
    async deleteObject(key: string) {
      objectStore.delete(key);
    },
  };

  return {
    prisma,
    storage,
    objectStore,
    documents,
    reports,
    pendingReports,
    approvals,
    executions,
    executionArtifacts,
    outboxEvents,
    sourceKey,
    textKey,
    artifactKeyOne,
    artifactKeyTwo,
  };
}

describe("document deletion integration", () => {
  it("deletes source, report, pending content, and private artifacts while preserving only content-free metadata", async () => {
    const harness = createInMemoryDeletionHarness();
    const documentRepo = createDocumentRepository(harness.prisma);
    const artifactRepo = createExecutionArtifactRepository(harness.prisma);
    const reportRepo = createReportRepository(harness.prisma);
    const approvalRepo = createApprovalRepository(harness.prisma);
    const historyRepo = createExecutionHistoryRepository(harness.prisma);

    const documentService = createDocumentService(documentRepo, harness.storage);
    const reportService = createReportService(reportRepo);
    const approvalService = createApprovalService(approvalRepo);
    const historyService = createExecutionHistoryService(historyRepo);

    // 1. Owner requests document deletion.
    await documentService.requestDeletion(ownerId, workspaceId, documentId);

    // Immediately: reports, pending reports, and pending approvals are gone or inaccessible.
    expect(await reportService.list(ownerId, workspaceId)).toEqual([]);
    expect(await reportService.get(ownerId, workspaceId, reportId)).toBeNull();
    expect(await approvalService.list(ownerId, workspaceId)).toEqual([]);
    expect(await approvalService.get(ownerId, workspaceId, approvalId)).toBeNull();
    expect(harness.reports).toHaveLength(0);
    expect(harness.pendingReports).toHaveLength(0);
    expect(harness.approvals).toHaveLength(0);

    // Document is in deleting state and cannot be re-completed.
    expect(harness.documents[0]?.status).toBe("deleting");
    await expect(
      documentService.completeUpload(ownerId, workspaceId, documentId),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });

    // An outbox cleanup event is queued for the document.
    expect(harness.outboxEvents).toHaveLength(1);
    expect(harness.outboxEvents[0]).toMatchObject({
      eventType: "object.delete",
      aggregateId: documentId,
      payload: {
        workspaceId,
        userId: ownerId,
        aggregateId: documentId,
      },
    });

    // 2. Simulate the outbox cleanup worker removing S3 objects, artifacts, and purging the document.
    const context = { userId: ownerId, workspaceId };
    const artifacts = await documentRepo.listArtifactsForDocument(
      context,
      documentId,
    );
    expect(artifacts.map((item) => item.publicId)).toEqual([
      harness.artifactKeyOne,
      harness.artifactKeyTwo,
    ]);
    for (const artifact of artifacts) {
      await harness.storage.deleteObject(artifact.publicId);
    }
    await artifactRepo.deleteForExecution(context, waitingExecutionId);
    await artifactRepo.deleteForExecution(context, completedExecutionId);
    await harness.storage.deletePrefix(
      `flowpilot/workspaces/${workspaceId}/documents/${documentId}/`,
    );
    await documentRepo.completeDeletion(context, documentId);

    // Source document, derived text, and execution artifacts are completely removed.
    expect(harness.objectStore.size).toBe(0);
    expect(harness.executionArtifacts).toHaveLength(0);
    expect(harness.documents).toHaveLength(0);
    expect(await documentService.list(ownerId, workspaceId)).toEqual([]);

    // 3. Only content-free execution metadata remains.
    const remainingExecutions = await historyService.list(ownerId, workspaceId);
    expect(remainingExecutions).toHaveLength(2);
    expect(
      remainingExecutions.find((item) => item.id === waitingExecutionId),
    ).toMatchObject({
      id: waitingExecutionId,
      status: "cancelled",
      errorCode: "DOCUMENT_REMOVED",
    });
    expect(
      remainingExecutions.find((item) => item.id === completedExecutionId),
    ).toMatchObject({
      id: completedExecutionId,
      status: "succeeded",
    });

    const cancelledDetail = await historyService.get(
      ownerId,
      workspaceId,
      waitingExecutionId,
    );
    expect(cancelledDetail).not.toBeNull();
    expect(cancelledDetail?.steps[0]?.status).toBe("skipped");
    expect(cancelledDetail?.steps[0]?.attempts[0]?.status).toBe("failed");
    expect(cancelledDetail?.steps[0]?.attempts[0]?.errorCode).toBe(
      "DOCUMENT_REMOVED",
    );
    expect(cancelledDetail?.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "approval.cancelled",
          details: { state: "cancelled", errorCode: "DOCUMENT_REMOVED" },
        }),
      ]),
    );

    // Verify no document text, report content, pending proposal, or private keys leak.
    const serializedHistory = JSON.stringify([
      remainingExecutions,
      cancelledDetail,
      await historyService.get(ownerId, workspaceId, completedExecutionId),
    ]);
    for (const forbidden of [
      sensitiveDocumentText,
      sensitiveReportSummary,
      sensitivePendingSummary,
      sensitiveActionItem,
      harness.sourceKey,
      harness.textKey,
      harness.artifactKeyOne,
      harness.artifactKeyTwo,
    ]) {
      expect(serializedHistory).not.toContain(forbidden);
    }
  });

  it("denies deletion from another user and leaves document, report, and artifacts intact", async () => {
    const harness = createInMemoryDeletionHarness();
    const documentService = createDocumentService(
      createDocumentRepository(harness.prisma),
      harness.storage,
    );

    await expect(
      documentService.requestDeletion(attackerId, workspaceId, documentId),
    ).rejects.toBeInstanceOf(TenantAccessError);

    expect(harness.documents[0]?.status).toBe("ready");
    expect(harness.reports).toHaveLength(1);
    expect(harness.pendingReports).toHaveLength(1);
    expect(harness.approvals).toHaveLength(1);
    expect(harness.executionArtifacts).toHaveLength(2);
    expect(harness.objectStore.size).toBe(4);
    expect(harness.outboxEvents).toHaveLength(0);
  });

  it("rejects deletion of a missing document with 404 NOT_FOUND", async () => {
    const harness = createInMemoryDeletionHarness();
    const documentService = createDocumentService(
      createDocumentRepository(harness.prisma),
      harness.storage,
    );

    await expect(
      documentService.requestDeletion(
        ownerId,
        workspaceId,
        "00000000-0000-4000-8000-000000000999",
      ),
    ).rejects.toThrowError(HttpError);
  });
});

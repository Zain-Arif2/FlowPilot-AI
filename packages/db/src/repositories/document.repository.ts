import { randomUUID } from "node:crypto";
import { DocumentMediaType, DocumentStatus, type PrismaClient } from "@prisma/client";
import type { TenantContext } from "../tenant-transaction.js";
import { withTenantTransaction } from "../tenant-transaction.js";

interface DocumentUploadInput {
  readonly filename: string;
  readonly mediaType:
    | "application/pdf"
    | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    | "text/plain";
  readonly byteSize: number;
}

function toDatabaseMediaType(
  mediaType: DocumentUploadInput["mediaType"],
): DocumentMediaType {
  switch (mediaType) {
    case "application/pdf":
      return DocumentMediaType.pdf;
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return DocumentMediaType.docx;
    case "text/plain":
      return DocumentMediaType.txt;
  }
}

export function createDocumentRepository(client: PrismaClient) {
  return {
    createUploadIntent(
      context: TenantContext,
      documentId: string,
      input: DocumentUploadInput,
      sourceObjectKey: string,
    ) {
      return withTenantTransaction(client, context, (transaction) =>
        transaction.document.create({
          data: {
            id: documentId,
            workspaceId: context.workspaceId,
            uploadedById: context.userId,
            originalName: input.filename,
            mediaType: toDatabaseMediaType(input.mediaType),
            byteSize: input.byteSize,
            sourceObjectKey,
            checksum: null,
          },
        }),
      );
    },

    list(context: TenantContext) {
      return withTenantTransaction(client, context, (transaction) =>
        transaction.document.findMany({
          where: { workspaceId: context.workspaceId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        }),
      );
    },

    findById(context: TenantContext, documentId: string) {
      return withTenantTransaction(client, context, (transaction) =>
        transaction.document.findFirst({
          where: { id: documentId, workspaceId: context.workspaceId },
        }),
      );
    },

    async markValidatingAndEnqueue(context: TenantContext, documentId: string) {
      return withTenantTransaction(client, context, async (transaction) => {
        const updated = await transaction.document.updateMany({
          where: {
            id: documentId,
            workspaceId: context.workspaceId,
            status: DocumentStatus.uploading,
          },
          data: { status: DocumentStatus.validating, failureCode: null },
        });
        if (updated.count !== 1) return null;

        await transaction.outboxEvent.create({
          data: {
            eventKey: `document.validate:${documentId}:${randomUUID()}`,
            eventType: "document.validate",
            aggregateId: documentId,
            payload: {
              workspaceId: context.workspaceId,
              userId: context.userId,
              aggregateId: documentId,
            },
          },
        });
        return transaction.document.findFirst({
          where: { id: documentId, workspaceId: context.workspaceId },
        });
      });
    },

    async markFailed(
      context: TenantContext,
      documentId: string,
      failureCode: string,
    ): Promise<boolean> {
      return withTenantTransaction(client, context, async (transaction) => {
        const updated = await transaction.document.updateMany({
          where: {
            id: documentId,
            workspaceId: context.workspaceId,
            status: {
              in: [DocumentStatus.uploading, DocumentStatus.validating],
            },
          },
          data: { status: DocumentStatus.failed, failureCode },
        });
        return updated.count === 1;
      });
    },

    async markReady(
      context: TenantContext,
      documentId: string,
      input: {
        readonly checksum: string;
        readonly pageCount: number | null;
        readonly textCharacterCount: number;
        readonly textObjectKey: string;
      },
    ): Promise<boolean> {
      return withTenantTransaction(client, context, async (transaction) => {
        const updated = await transaction.document.updateMany({
          where: {
            id: documentId,
            workspaceId: context.workspaceId,
            status: DocumentStatus.validating,
          },
          data: {
            status: DocumentStatus.ready,
            failureCode: null,
            checksum: input.checksum,
            pageCount: input.pageCount,
            textCharacterCount: input.textCharacterCount,
            textObjectKey: input.textObjectKey,
          },
        });
        return updated.count === 1;
      });
    },

    async markDeleting(context: TenantContext, documentId: string): Promise<boolean> {
      return withTenantTransaction(client, context, async (transaction) => {
        const document = await transaction.document.findFirst({
          where: { id: documentId, workspaceId: context.workspaceId },
          select: { id: true, status: true },
        });
        if (!document) return false;
        if (document.status === DocumentStatus.deleting) return true;

        const reports = await transaction.report.findMany({
          where: {
            workspaceId: context.workspaceId,
            sourceDocumentId: documentId,
          },
          select: { id: true },
        });
        const reportIds = reports.map((report) => report.id);
        const affectedApprovals = await transaction.approval.findMany({
          where: {
            workspaceId: context.workspaceId,
            OR: [
              { pendingReport: { sourceDocumentId: documentId } },
              ...(reportIds.length > 0 ? [{ targetReportId: { in: reportIds } }] : []),
            ],
            status: "pending",
          },
          select: { id: true, executionId: true },
        });
        const affectedExecutionIds = affectedApprovals.map(
          (approval) => approval.executionId,
        );
        for (const approval of affectedApprovals) {
          await transaction.executionEvent.create({
            data: {
              workspaceId: context.workspaceId,
              executionId: approval.executionId,
              eventType: "approval.cancelled",
              safeDetails: { state: "cancelled", errorCode: "DOCUMENT_REMOVED" },
            },
          });
        }

        if (affectedApprovals.length > 0) {
          await transaction.approval.updateMany({
            where: {
              workspaceId: context.workspaceId,
              id: { in: affectedApprovals.map((approval) => approval.id) },
            },
            data: { status: "cancelled", decidedAt: new Date() },
          });
        }
        await transaction.pendingReport.deleteMany({
          where: {
            workspaceId: context.workspaceId,
            OR: [
              { sourceDocumentId: documentId },
              ...(reportIds.length > 0 ? [{ reportId: { in: reportIds } }] : []),
            ],
          },
        });
        if (reportIds.length > 0) {
          await transaction.approval.deleteMany({
            where: {
              workspaceId: context.workspaceId,
              targetReportId: { in: reportIds },
            },
          });
          await transaction.report.deleteMany({
            where: {
              workspaceId: context.workspaceId,
              sourceDocumentId: documentId,
            },
          });
        }

        const activeExecutions = await transaction.execution.findMany({
          where: {
            workspaceId: context.workspaceId,
            documentId,
            status: { in: ["queued", "running", "waiting_approval"] },
          },
          select: { id: true },
        });
        const activeExecutionIds = activeExecutions.map((execution) => execution.id);
        const executionIdsToCancel = [
          ...new Set([...activeExecutionIds, ...affectedExecutionIds]),
        ];
        if (executionIdsToCancel.length > 0) {
          await transaction.execution.updateMany({
            where: {
              workspaceId: context.workspaceId,
              id: { in: executionIdsToCancel },
              status: { in: ["queued", "running", "waiting_approval"] },
            },
            data: {
              documentId: null,
              status: "cancelled",
              finishedAt: new Date(),
              errorCode: "DOCUMENT_REMOVED",
              errorMessage: "The source document was removed.",
            },
          });
          await transaction.executionStep.updateMany({
            where: {
              workspaceId: context.workspaceId,
              executionId: { in: executionIdsToCancel },
              status: { in: ["pending", "running", "waiting_approval"] },
            },
            data: { status: "skipped" },
          });
          await transaction.stepAttempt.updateMany({
            where: {
              workspaceId: context.workspaceId,
              executionStep: { executionId: { in: executionIdsToCancel } },
              status: "running",
            },
            data: {
              status: "failed",
              finishedAt: new Date(),
              errorCode: "DOCUMENT_REMOVED",
              errorMessage: "The source document was removed.",
            },
          });
        }
        await transaction.execution.updateMany({
          where: {
            workspaceId: context.workspaceId,
            documentId,
          },
          data: { documentId: null },
        });
        await transaction.document.update({
          where: { id: documentId },
          data: { status: DocumentStatus.deleting },
        });
        await transaction.outboxEvent.create({
          data: {
            eventKey: `object.delete:${documentId}:${randomUUID()}`,
            eventType: "object.delete",
            aggregateId: documentId,
            payload: {
              workspaceId: context.workspaceId,
              userId: context.userId,
              aggregateId: documentId,
            },
          },
        });
        return true;
      });
    },

    listArtifactsForDocument(context: TenantContext, documentId: string) {
      return withTenantTransaction(client, context, (transaction) =>
        transaction.executionArtifact.findMany({
          where: {
            workspaceId: context.workspaceId,
            sourceDocumentId: documentId,
          },
          select: { id: true, objectKey: true },
        }),
      );
    },

    async completeDeletion(context: TenantContext, documentId: string): Promise<void> {
      await withTenantTransaction(client, context, async (transaction) => {
        await transaction.executionArtifact.deleteMany({
          where: {
            workspaceId: context.workspaceId,
            sourceDocumentId: documentId,
          },
        });
        await transaction.document.deleteMany({
          where: {
            id: documentId,
            workspaceId: context.workspaceId,
            status: DocumentStatus.deleting,
          },
        });
      });
    },
  };
}

export type DocumentRepository = ReturnType<typeof createDocumentRepository>;

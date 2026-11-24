import { randomUUID } from "node:crypto";
import type { DocumentRepository } from "@flowpilot/db/repositories";
import {
  DocumentSchema,
  DocumentUploadRequestSchema,
  DocumentUploadIntentSchema,
  type DocumentDto,
} from "@flowpilot/shared";
import { HttpError } from "../../errors/api-error.js";
import type { DocumentService } from "../../services/contracts.js";
import {
  createPrivateObjectKey,
  ObjectStorageError,
  type SignedObjectUrl,
} from "../../adapters/object-storage.js";

type ObjectStorage = {
  createUploadUrl(input: {
    readonly key: string;
    readonly mediaType: string;
    readonly byteSize: number;
  }): Promise<SignedObjectUrl>;
  headObject(key: string): Promise<{
    readonly byteSize: number;
    readonly mediaType: string | null;
  } | null>;
};

type DatabaseMediaType = "pdf" | "docx" | "txt";

const mimeByDatabaseType: Record<DatabaseMediaType, DocumentDto["mediaType"]> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
};

function toDocumentDto(document: {
  id: string;
  status: string;
  originalName: string;
  mediaType: DatabaseMediaType;
  byteSize: number;
  failureCode: string | null;
  createdAt: Date;
}): DocumentDto {
  return DocumentSchema.parse({
    id: document.id,
    status: document.status,
    filename: document.originalName,
    mediaType: mimeByDatabaseType[document.mediaType],
    byteSize: document.byteSize,
    ...(document.failureCode ? { failureCode: document.failureCode } : {}),
    createdAt: document.createdAt.toISOString(),
  });
}

export function createDocumentService(
  repository: DocumentRepository,
  storage: ObjectStorage,
): DocumentService {
  return {
    async list(userId, workspaceId) {
      const documents = await repository.list({ userId, workspaceId });
      return documents.map(toDocumentDto);
    },

    async createUploadIntent(userId, workspaceId, input) {
      const request = DocumentUploadRequestSchema.parse(input);
      const documentId = randomUUID();
      const sourceObjectKey = createPrivateObjectKey(workspaceId, documentId, "source");
      const document = await repository.createUploadIntent(
        { userId, workspaceId },
        documentId,
        request,
        sourceObjectKey,
      );
      let uploadUrl: SignedObjectUrl;
      try {
        uploadUrl = await storage.createUploadUrl({
          key: sourceObjectKey,
          mediaType: request.mediaType,
          byteSize: request.byteSize,
        });
      } catch (error) {
        await repository.markFailed(
          { userId, workspaceId },
          document.id,
          "STORAGE_UNAVAILABLE",
        );
        if (error instanceof ObjectStorageError) {
          throw new HttpError(
            503,
            "SERVICE_UNAVAILABLE",
            "Private storage is temporarily unavailable.",
          );
        }
        throw error;
      }

      return DocumentUploadIntentSchema.parse({
        document: toDocumentDto(document),
        uploadUrl: uploadUrl.url,
        expiresAt: uploadUrl.expiresAt.toISOString(),
      });
    },

    async completeUpload(userId, workspaceId, documentId) {
      const context = { userId, workspaceId };
      const document = await repository.findById(context, documentId);
      if (!document || document.status === "deleting") {
        throw new HttpError(404, "NOT_FOUND", "Document was not found.");
      }
      if (document.status === "ready" || document.status === "validating") {
        return toDocumentDto(document);
      }
      if (document.status !== "uploading") {
        throw new HttpError(
          409,
          "CONFLICT",
          "The document upload cannot be completed.",
        );
      }

      let object: Awaited<ReturnType<ObjectStorage["headObject"]>>;
      try {
        object = await storage.headObject(document.sourceObjectKey);
      } catch (error) {
        if (error instanceof ObjectStorageError) {
          throw new HttpError(
            503,
            "SERVICE_UNAVAILABLE",
            "Private storage is temporarily unavailable.",
          );
        }
        throw error;
      }
      if (!object) {
        throw new HttpError(409, "CONFLICT", "The uploaded file is not available yet.");
      }
      if (object.byteSize !== document.byteSize) {
        await repository.markFailed(context, documentId, "UPLOAD_SIZE_MISMATCH");
        throw new HttpError(
          422,
          "INVALID_INPUT",
          "The uploaded file size did not match.",
        );
      }
      if (object.mediaType !== mimeByDatabaseType[document.mediaType]) {
        await repository.markFailed(context, documentId, "UPLOAD_TYPE_MISMATCH");
        throw new HttpError(
          422,
          "INVALID_INPUT",
          "The uploaded file type did not match.",
        );
      }

      const validating = await repository.markValidatingAndEnqueue(context, documentId);
      if (validating) return toDocumentDto(validating);

      const current = await repository.findById(context, documentId);
      if (current && (current.status === "validating" || current.status === "ready")) {
        return toDocumentDto(current);
      }
      throw new HttpError(409, "CONFLICT", "The document upload cannot be completed.");
    },

    async requestDeletion(userId, workspaceId, documentId) {
      const deleted = await repository.markDeleting(
        { userId, workspaceId },
        documentId,
      );
      if (!deleted) throw new HttpError(404, "NOT_FOUND", "Document was not found.");
    },
  };
}

import { randomUUID } from "node:crypto";
import type { DocumentRepository } from "@flowpilot/db/repositories";
import {
  DocumentFileValidationError,
  DocumentSchema,
  DocumentUploadIntentSchema,
  DocumentUploadRequestSchema,
  assertDocumentBytes,
  assertDocumentFilename,
  documentExtensionForMediaType,
  type DocumentDto,
  type DocumentFileFailureCode,
} from "@flowpilot/shared";
import { createDocumentSourcePublicId } from "@flowpilot/shared/storage/cloudinary";
import { HttpError } from "../../errors/api-error.js";
import type { DocumentService } from "../../services/contracts.js";
import {
  ObjectStorageError,
  type CloudinaryAssetReference,
  type ObjectStorage,
} from "../../adapters/object-storage.js";

const DEFAULT_MAX_UPLOAD_BYTES = 10_000_000;
const UPLOAD_INTENT_TTL_SECONDS = 15 * 60;

type DocumentStorage = Pick<ObjectStorage, "uploadAsset" | "inspectAsset" | "deleteAsset">;

type DatabaseMediaType = "pdf" | "docx" | "txt";

const mimeByDatabaseType: Record<DatabaseMediaType, DocumentDto["mediaType"]> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
};

const failureCodeByValidationError: Record<DocumentFileFailureCode, string> = {
  EMPTY_FILE: "EMPTY_FILE",
  FILE_TOO_LARGE: "DOCUMENT_TOO_LARGE",
  SIZE_MISMATCH: "UPLOAD_SIZE_MISMATCH",
  TYPE_MISMATCH: "UPLOAD_TYPE_MISMATCH",
  UNSUPPORTED_CONTENT: "UPLOAD_CONTENT_INVALID",
};

export interface DocumentServiceOptions {
  readonly maxUploadBytes?: number;
}

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

function sourceAssetReference(document: {
  sourcePublicId: string;
  sourceResourceType: string;
  sourceDeliveryType: string;
  sourceFormat: string;
}): CloudinaryAssetReference {
  if (
    document.sourceResourceType !== "raw" ||
    document.sourceDeliveryType !== "authenticated" ||
    document.sourceFormat.length === 0
  ) {
    throw new HttpError(
      500,
      "INTERNAL_ERROR",
      "The stored document metadata is invalid.",
    );
  }
  return {
    publicId: document.sourcePublicId,
    resourceType: "raw",
    deliveryType: "authenticated",
    format: document.sourceFormat,
  };
}

function normalizeContentType(value: string): string {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function createDocumentService(
  repository: DocumentRepository,
  storage: DocumentStorage,
  options: DocumentServiceOptions = {},
): DocumentService {
  const maxUploadBytes = options.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES;

  async function transitionToValidation(
    context: { userId: string; workspaceId: string },
    documentId: string,
  ): Promise<DocumentDto> {
    const validating = await repository.markValidatingAndEnqueue(
      context,
      documentId,
    );
    if (validating) return toDocumentDto(validating);

    const current = await repository.findById(context, documentId);
    if (current && (current.status === "validating" || current.status === "ready")) {
      return toDocumentDto(current);
    }
    throw new HttpError(
      409,
      "CONFLICT",
      "The document upload cannot be completed.",
    );
  }

  return {
    async list(userId, workspaceId) {
      const documents = await repository.list({ userId, workspaceId });
      return documents.map(toDocumentDto);
    },

    async createUploadIntent(userId, workspaceId, input) {
      const request = DocumentUploadRequestSchema.parse(input);
      try {
        assertDocumentFilename(request.filename, request.mediaType);
      } catch (error) {
        if (error instanceof DocumentFileValidationError) {
          throw new HttpError(
            422,
            "INVALID_INPUT",
            "The filename extension does not match the file type.",
          );
        }
        throw error;
      }
      if (request.byteSize > maxUploadBytes) {
        throw new HttpError(
          422,
          "INVALID_INPUT",
          "The file exceeds the configured document size limit.",
        );
      }

      const documentId = randomUUID();
      const sourcePublicId = createDocumentSourcePublicId({
        workspaceId,
        documentId,
        extension: documentExtensionForMediaType(request.mediaType),
      });
      const document = await repository.createUploadIntent(
        { userId, workspaceId },
        documentId,
        request,
        {
          publicId: sourcePublicId,
          resourceType: "raw",
          deliveryType: "authenticated",
          format: documentExtensionForMediaType(request.mediaType),
        },
      );

      return DocumentUploadIntentSchema.parse({
        document: toDocumentDto(document),
        uploadUrl: `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/documents/${encodeURIComponent(document.id)}/upload`,
        expiresAt: new Date(
          Date.now() + UPLOAD_INTENT_TTL_SECONDS * 1_000,
        ).toISOString(),
        maxUploadBytes,
      });
    },

    async uploadDocument(userId, workspaceId, documentId, input) {
      const context = { userId, workspaceId };
      let document = await repository.findById(context, documentId);
      if (!document || document.status === "deleting") {
        throw new HttpError(404, "NOT_FOUND", "Document was not found.");
      }
      if (document.status === "ready" || document.status === "validating") {
        return toDocumentDto(document);
      }
      if (document.status === "failed") {
        const retrying = await repository.markRetrying(context, documentId);
        if (!retrying) {
          document = await repository.findById(context, documentId);
          if (!document || document.status === "deleting") {
            throw new HttpError(404, "NOT_FOUND", "Document was not found.");
          }
          if (document.status === "ready" || document.status === "validating") {
            return toDocumentDto(document);
          }
          throw new HttpError(
            409,
            "CONFLICT",
            "The document upload cannot be completed.",
          );
        }
      } else if (document.status !== "uploading") {
        throw new HttpError(
          409,
          "CONFLICT",
          "The document upload cannot be completed.",
        );
      }

      const expectedMediaType = mimeByDatabaseType[document.mediaType];
      if (normalizeContentType(input.contentType) !== expectedMediaType) {
        await repository.markFailed(context, documentId, "UPLOAD_TYPE_MISMATCH");
        throw new HttpError(
          422,
          "INVALID_INPUT",
          "The uploaded file type did not match the declared type.",
        );
      }

      try {
        assertDocumentFilename(document.originalName, expectedMediaType);
        assertDocumentBytes({
          bytes: input.bytes,
          mediaType: expectedMediaType,
          byteSize: document.byteSize,
          maxBytes: maxUploadBytes,
        });
      } catch (error) {
        if (!(error instanceof DocumentFileValidationError)) throw error;
        const failureCode = failureCodeByValidationError[error.code];
        await repository.markFailed(context, documentId, failureCode);
        throw new HttpError(
          422,
          "INVALID_INPUT",
          error.code === "FILE_TOO_LARGE"
            ? "The file exceeds the configured document size limit."
            : "The uploaded file failed content validation.",
        );
      }

      const reference = sourceAssetReference(document);
      let stored: Awaited<ReturnType<DocumentStorage["uploadAsset"]>>;
      try {
        stored = await storage.uploadAsset({
          publicId: reference.publicId,
          body: input.bytes,
        });
        const inspected = await storage.inspectAsset(reference);
        if (!inspected || inspected.bytes !== document.byteSize) {
          throw new ObjectStorageError(
            "STORAGE_VERIFICATION_FAILED",
            new Error("Uploaded asset verification failed."),
          );
        }
        stored = inspected;
      } catch (error) {
        await storage.deleteAsset(reference).catch(() => undefined);
        await repository.markFailed(context, documentId, "STORAGE_UNAVAILABLE");
        if (error instanceof ObjectStorageError) {
          throw new HttpError(
            error.code === "STORAGE_VERIFICATION_FAILED" ? 502 : 503,
            "SERVICE_UNAVAILABLE",
            "Private storage could not confirm the upload.",
          );
        }
        throw error;
      }

      const uploaded = await repository.markUploaded(context, documentId, {
        assetId: stored.assetId,
        version: stored.version,
        bytes: stored.bytes,
        format: stored.format,
      });
      if (!uploaded) {
        const current = await repository.findById(context, documentId);
        if (current && (current.status === "validating" || current.status === "ready")) {
          return toDocumentDto(current);
        }
        throw new HttpError(
          409,
          "CONFLICT",
          "The document upload cannot be completed.",
        );
      }

      return transitionToValidation(context, documentId);
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

      const reference = sourceAssetReference(document);
      let inspected: Awaited<ReturnType<DocumentStorage["inspectAsset"]>>;
      try {
        inspected = await storage.inspectAsset(reference);
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
      if (!inspected) {
        throw new HttpError(
          409,
          "CONFLICT",
          "The uploaded file is not available yet.",
        );
      }
      if (inspected.bytes !== document.byteSize) {
        await repository.markFailed(context, documentId, "UPLOAD_SIZE_MISMATCH");
        throw new HttpError(
          422,
          "INVALID_INPUT",
          "The uploaded file size did not match.",
        );
      }

      const uploaded = await repository.markUploaded(context, documentId, {
        assetId: inspected.assetId,
        version: inspected.version,
        bytes: inspected.bytes,
        format: inspected.format,
      });
      if (!uploaded) {
        const current = await repository.findById(context, documentId);
        if (current && (current.status === "validating" || current.status === "ready")) {
          return toDocumentDto(current);
        }
        throw new HttpError(
          409,
          "CONFLICT",
          "The document upload cannot be completed.",
        );
      }
      return transitionToValidation(context, documentId);
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

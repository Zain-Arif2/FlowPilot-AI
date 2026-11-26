import express, { Router, type RequestHandler } from "express";
import type { Router as ExpressRouter } from "express";
import {
  DocumentListSchema,
  DocumentUploadIntentSchema,
  DocumentUploadRequestSchema,
  DocumentSchema,
  UuidSchema,
} from "@flowpilot/shared";
import { HttpError } from "../../errors/api-error.js";
import { createWorkspaceAuthorization } from "../../middleware/workspace.js";
import type { DocumentService, WorkspaceService } from "../../services/contracts.js";
import { parseInput } from "../../validation.js";
import type { AppConfig } from "../../config.js";

const supportedDocumentContentTypes = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

export function createDocumentRouter(
  service: DocumentService,
  workspaces: WorkspaceService,
  authenticate: RequestHandler,
  config: Pick<AppConfig, "DOCUMENT_MAX_BYTES">,
): ExpressRouter {
  const router = Router();
  router.use(authenticate);
  const authorizeWorkspace = createWorkspaceAuthorization(({ userId, workspaceId }) =>
    workspaces.verifyOwner(userId, workspaceId),
  );

  router.get(
    "/:workspaceId/documents",
    authorizeWorkspace,
    async (request, response) => {
      const user = request.authUser;
      const workspaceId = request.params.workspaceId;
      if (!user || typeof workspaceId !== "string") {
        throw new HttpError(404, "NOT_FOUND", "Workspace was not found.");
      }
      const documents = await service.list(user.id, workspaceId);
      response.status(200).json(DocumentListSchema.parse(documents));
    },
  );

  router.post(
    "/:workspaceId/documents",
    authorizeWorkspace,
    async (request, response) => {
      const user = request.authUser;
      const workspaceId = request.params.workspaceId;
      if (!user || typeof workspaceId !== "string") {
        throw new HttpError(404, "NOT_FOUND", "Workspace was not found.");
      }
      const input = parseInput(DocumentUploadRequestSchema, request.body);
      const intent = await service.createUploadIntent(user.id, workspaceId, input);
      response.status(201).json(DocumentUploadIntentSchema.parse(intent));
    },
  );

  router.put(
    "/:workspaceId/documents/:documentId/upload",
    authorizeWorkspace,
    express.raw({
      type: supportedDocumentContentTypes,
      limit: config.DOCUMENT_MAX_BYTES,
    }),
    async (request, response) => {
      const user = request.authUser;
      const { workspaceId, documentId } = request.params;
      if (
        !user ||
        typeof workspaceId !== "string" ||
        typeof documentId !== "string" ||
        !UuidSchema.safeParse(documentId).success
      ) {
        throw new HttpError(404, "NOT_FOUND", "Document was not found.");
      }
      const contentType = request.get("content-type");
      if (
        !contentType ||
        !supportedDocumentContentTypes.includes(
          (contentType.split(";")[0] ?? "").trim().toLowerCase(),
        )
      ) {
        throw new HttpError(
          415,
          "UNSUPPORTED_MEDIA_TYPE",
          "Only PDF, DOCX, and TXT files are accepted.",
        );
      }
      if (!Buffer.isBuffer(request.body) || request.body.byteLength === 0) {
        throw new HttpError(
          422,
          "INVALID_INPUT",
          "The request body must contain the raw file bytes.",
        );
      }
      const document = await service.uploadDocument(
        user.id,
        workspaceId,
        documentId,
        { bytes: new Uint8Array(request.body), contentType },
      );
      response.status(202).json(DocumentSchema.parse(document));
    },
  );

  router.post(
    "/:workspaceId/documents/:documentId/complete",
    authorizeWorkspace,
    async (request, response) => {
      const user = request.authUser;
      const { workspaceId, documentId } = request.params;
      if (
        !user ||
        typeof workspaceId !== "string" ||
        typeof documentId !== "string" ||
        !UuidSchema.safeParse(documentId).success
      ) {
        throw new HttpError(404, "NOT_FOUND", "Document was not found.");
      }
      const document = await service.completeUpload(user.id, workspaceId, documentId);
      response.status(202).json(DocumentSchema.parse(document));
    },
  );

  router.delete(
    "/:workspaceId/documents/:documentId",
    authorizeWorkspace,
    async (request, response) => {
      const user = request.authUser;
      const { workspaceId, documentId } = request.params;
      if (
        !user ||
        typeof workspaceId !== "string" ||
        typeof documentId !== "string" ||
        !UuidSchema.safeParse(documentId).success
      ) {
        throw new HttpError(404, "NOT_FOUND", "Document was not found.");
      }
      await service.requestDeletion(user.id, workspaceId, documentId);
      response.status(202).end();
    },
  );

  return router;
}

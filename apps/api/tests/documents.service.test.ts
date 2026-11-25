import { describe, expect, it, vi } from "vitest";
import { ObjectStorageError } from "../src/adapters/object-storage.js";
import { createDocumentService } from "../src/modules/documents/service.js";
import { HttpError } from "../src/errors/api-error.js";

const userId = "00000000-0000-4000-8000-000000000001";
const workspaceId = "00000000-0000-4000-8000-000000000011";
const documentId = "00000000-0000-4000-8000-000000000031";

function createRepositoryMock() {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const baseDoc = {
    id: documentId,
    workspaceId,
    uploadedById: userId,
    status: "uploading" as const,
    originalName: "contract.pdf",
    mediaType: "pdf" as const,
    byteSize: 1024,
    sourceObjectKey: `workspaces/${workspaceId}/documents/${documentId}/source/key`,
    textObjectKey: null,
    checksum: null,
    pageCount: null,
    textCharacterCount: null,
    failureCode: null,
    createdAt: now,
    updatedAt: now,
  };

  return {
    baseDoc,
    list: vi.fn(async () => [baseDoc]),
    createUploadIntent: vi.fn(async (_ctx, id: string) => ({ ...baseDoc, id })),
    findById: vi.fn(async () => baseDoc),
    markValidatingAndEnqueue: vi.fn(async () => ({ ...baseDoc, status: "validating" as const })),
    markFailed: vi.fn(async () => true),
    markReady: vi.fn(async () => true),
    markDeleting: vi.fn(async () => true),
    listArtifactsForDocument: vi.fn(async () => []),
    completeDeletion: vi.fn(async () => {}),
  };
}

describe("createDocumentService", () => {
  it("creates upload intent and completes upload when storage metadata matches", async () => {
    const repo = createRepositoryMock();
    const storage = {
      createUploadUrl: vi.fn(async () => ({
        url: "https://storage.example/upload",
        expiresAt: new Date("2026-01-01T00:05:00.000Z"),
      })),
      headObject: vi.fn(async () => ({
        byteSize: 1024,
        mediaType: "application/pdf",
      })),
    };
    const service = createDocumentService(repo, storage);

    const intent = await service.createUploadIntent(userId, workspaceId, {
      filename: "contract.pdf",
      mediaType: "application/pdf",
      byteSize: 1024,
    });
    expect(intent.uploadUrl).toBe("https://storage.example/upload");
    expect(intent.document.status).toBe("uploading");

    const completed = await service.completeUpload(userId, workspaceId, documentId);
    expect(completed.status).toBe("validating");
    expect(repo.markValidatingAndEnqueue).toHaveBeenCalledOnce();
  });

  it("marks document failed and throws 503 when object storage fails during upload intent", async () => {
    const repo = createRepositoryMock();
    const storage = {
      createUploadUrl: vi.fn(async () => {
        throw new ObjectStorageError("STORAGE_UNAVAILABLE", new Error("ECONNREFUSED"));
      }),
      headObject: vi.fn(async () => null),
    };
    const service = createDocumentService(repo, storage);

    await expect(
      service.createUploadIntent(userId, workspaceId, {
        filename: "contract.pdf",
        mediaType: "application/pdf",
        byteSize: 1024,
      }),
    ).rejects.toMatchObject({
      status: 503,
      code: "SERVICE_UNAVAILABLE",
    });

    expect(repo.markFailed).toHaveBeenCalledWith(
      { userId, workspaceId },
      expect.any(String),
      "STORAGE_UNAVAILABLE",
    );
  });

  it("requests deletion for an owned document and throws 404 when missing", async () => {
    const repo = createRepositoryMock();
    const storage = {
      createUploadUrl: vi.fn(),
      headObject: vi.fn(),
    };
    const service = createDocumentService(repo, storage);

    await expect(
      service.requestDeletion(userId, workspaceId, documentId),
    ).resolves.toBeUndefined();
    expect(repo.markDeleting).toHaveBeenCalledWith(
      { userId, workspaceId },
      documentId,
    );

    repo.markDeleting.mockResolvedValueOnce(false);
    await expect(
      service.requestDeletion(userId, workspaceId, documentId),
    ).rejects.toBeInstanceOf(HttpError);
  });
});


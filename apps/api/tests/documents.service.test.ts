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
    sourcePublicId: `flowpilot/workspaces/${workspaceId}/documents/${documentId}/source/contract.pdf`,
    sourceResourceType: "raw",
    sourceDeliveryType: "authenticated",
    sourceFormat: "pdf",
    sourceAssetId: null,
    sourceVersion: null,
    sourceUploadedAt: null,
    textPublicId: null,
    textResourceType: null,
    textDeliveryType: null,
    textFormat: null,
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
    markRetrying: vi.fn(async () => true),
    markUploaded: vi.fn(async () => true),
    markDeleting: vi.fn(async () => true),
    listArtifactsForDocument: vi.fn(async () => []),
    completeDeletion: vi.fn(async () => {}),
  };
}

describe("createDocumentService", () => {
  it("creates upload intent and returns an internal upload URL with maxUploadBytes", async () => {
    const repo = createRepositoryMock();
    const storage = {
      uploadAsset: vi.fn(async () => ({
        assetId: "asset-id-123",
        version: 1,
        bytes: 1024,
        format: "pdf",
        etag: "etag-abc",
        publicId: "flowpilot/workspaces/ws-1/documents/doc-1/source",
        resourceType: "raw" as const,
        deliveryType: "authenticated" as const,
      })),
      inspectAsset: vi.fn(async () => ({
        assetId: "asset-id-123",
        version: 1,
        bytes: 1024,
        format: "pdf",
        etag: "etag-abc",
        publicId: "flowpilot/workspaces/ws-1/documents/doc-1/source",
        resourceType: "raw" as const,
        deliveryType: "authenticated" as const,
      })),
      deleteAsset: vi.fn(async () => {}),
    };
    const service = createDocumentService(repo, storage);

    const intent = await service.createUploadIntent(userId, workspaceId, {
      filename: "contract.pdf",
      mediaType: "application/pdf",
      byteSize: 1024,
    });
    expect(intent.uploadUrl).toContain("/documents/");
    expect(intent.document.status).toBe("uploading");
    expect(intent.maxUploadBytes).toBeGreaterThan(0);
  });

  it("marks document failed and throws 503 when object storage fails during uploadDocument", async () => {
    const repo = createRepositoryMock();
    const storage = {
      uploadAsset: vi.fn(async () => {
        throw new ObjectStorageError("STORAGE_UNAVAILABLE", new Error("ECONNREFUSED"));
      }),
      inspectAsset: vi.fn(async () => null),
      deleteAsset: vi.fn(async () => {}),
    };
    const service = createDocumentService(repo, storage);

    // Build a 1024-byte buffer with a valid PDF signature so it passes
    // assertDocumentBytes before reaching the storage layer.
    const pdfBytes = new Uint8Array(1024);
    pdfBytes[0] = 0x25; // %
    pdfBytes[1] = 0x50; // P
    pdfBytes[2] = 0x44; // D
    pdfBytes[3] = 0x46; // F
    pdfBytes[4] = 0x2d; // -  (completes the %PDF- header signature)

    await expect(
      service.uploadDocument(userId, workspaceId, documentId, {
        bytes: pdfBytes,
        contentType: "application/pdf",
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
      uploadAsset: vi.fn(),
      inspectAsset: vi.fn(),
      deleteAsset: vi.fn(),
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

import {
  CloudinaryStorageError,
  createCloudinaryStorage,
  CLOUDINARY_PUBLIC_ID_PREFIX,
} from "@flowpilot/shared/storage/cloudinary";
import type { AppConfig } from "../config.js";
import { UuidSchema } from "@flowpilot/shared/schemas";
import { randomUUID } from "node:crypto";

export { CloudinaryStorageError as ObjectStorageError };
export type { CloudinaryAssetReference } from "@flowpilot/shared/storage/cloudinary";

export function mapObjectStorageError(cause: unknown): CloudinaryStorageError {
  return new CloudinaryStorageError("STORAGE_UNAVAILABLE", cause);
}

export function createPrivateObjectKey(
  workspaceId: string,
  documentId: string,
  kind: "source" | "text",
): string {
  const safeWorkspaceId = UuidSchema.parse(workspaceId);
  const safeDocumentId = UuidSchema.parse(documentId);
  return [CLOUDINARY_PUBLIC_ID_PREFIX, "workspaces", safeWorkspaceId, "documents", safeDocumentId, kind, `${randomUUID()}.pdf`].join("/");
}

export function createObjectStorage(config: AppConfig) {
  return createCloudinaryStorage({
    cloudName: config.CLOUDINARY_CLOUD_NAME,
    apiKey: config.CLOUDINARY_API_KEY,
    apiSecret: config.CLOUDINARY_API_SECRET,
  });
}

export type ObjectStorage = ReturnType<typeof createObjectStorage>;

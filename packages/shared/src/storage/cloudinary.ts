import { randomUUID } from "node:crypto";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import { UuidSchema } from "../schemas/common.js";
import { DOCUMENT_MAX_BYTES } from "../schemas/resources.js";

export const CLOUDINARY_RESOURCE_TYPE = "raw" as const;
export const CLOUDINARY_DELIVERY_TYPE = "authenticated" as const;
export const CLOUDINARY_PUBLIC_ID_PREFIX = "flowpilot";
export const DEFAULT_CLOUDINARY_SIGNED_URL_TTL_SECONDS = 300;
export const DEFAULT_DOCUMENT_MAX_BYTES = DOCUMENT_MAX_BYTES;
export const DOCUMENT_MAX_BYTES_CEILING = DOCUMENT_MAX_BYTES;

export type CloudinaryResourceType = typeof CLOUDINARY_RESOURCE_TYPE;
export type CloudinaryDeliveryType = typeof CLOUDINARY_DELIVERY_TYPE;

export interface CloudinaryStorageConfig {
  readonly cloudName: string;
  readonly apiKey: string;
  readonly apiSecret: string;
}

export interface CloudinaryAssetReference {
  readonly publicId: string;
  readonly resourceType: CloudinaryResourceType;
  readonly deliveryType: CloudinaryDeliveryType;
  readonly format: string;
}

export interface CloudinaryStoredAsset extends CloudinaryAssetReference {
  readonly bytes: number;
  readonly version: number | null;
  readonly assetId: string | null;
  readonly etag: string | null;
}

export interface SignedCloudinaryUrl {
  readonly url: string;
  readonly expiresAt: Date;
}

export type CloudinaryStorageErrorCode =
  | "STORAGE_UNAVAILABLE"
  | "STORAGE_NOT_FOUND"
  | "STORAGE_UPLOAD_FAILED"
  | "STORAGE_VERIFICATION_FAILED";

export class CloudinaryStorageError extends Error {
  constructor(
    readonly code: CloudinaryStorageErrorCode,
    cause?: unknown,
  ) {
    super(
      code === "STORAGE_NOT_FOUND"
        ? "The stored asset was not found."
        : "Private document storage is temporarily unavailable.",
      cause === undefined ? undefined : { cause },
    );
    this.name = "CloudinaryStorageError";
  }
}

function isCloudinaryNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as {
    readonly http_code?: unknown;
    readonly error?: { readonly http_code?: unknown };
  };
  return candidate.http_code === 404 || candidate.error?.http_code === 404;
}

function assertPublicId(publicId: string): string {
  if (
    publicId.length === 0 ||
    publicId.length > 1_024 ||
    publicId.includes("..") ||
    publicId.startsWith("/")
  ) {
    throw new CloudinaryStorageError("STORAGE_VERIFICATION_FAILED");
  }
  return publicId;
}

// Legacy wrapper functions for backward compatibility
export function createDocumentSourceKey(input: {
  readonly workspaceId: string;
  readonly documentId: string;
  readonly extension: "pdf" | "docx" | "txt";
}): string {
  return createDocumentSourcePublicId(input);
}

export function createDocumentTextKey(input: {
  readonly workspaceId: string;
  readonly documentId: string;
}): string {
  return createDocumentTextPublicId(input);
}

export function createDocumentArtifactKey(input: {
  readonly workspaceId: string;
  readonly sourceDocumentId: string;
  readonly executionId: string;
  readonly executionStepId: string;
}): string {
  return createExecutionArtifactPublicId(input);
}

export function createDocumentSourcePublicId(input: {
  readonly workspaceId: string;
  readonly documentId: string;
  readonly extension: "pdf" | "docx" | "txt";
}): string {
  const workspaceId = UuidSchema.parse(input.workspaceId);
  const documentId = UuidSchema.parse(input.documentId);
  return [
    CLOUDINARY_PUBLIC_ID_PREFIX,
    "workspaces",
    workspaceId,
    "documents",
    documentId,
    "source",
    `${randomUUID()}.${input.extension}`,
  ].join("/");
}

export function createDocumentTextPublicId(input: {
  readonly workspaceId: string;
  readonly documentId: string;
}): string {
  const workspaceId = UuidSchema.parse(input.workspaceId);
  const documentId = UuidSchema.parse(input.documentId);
  return [
    CLOUDINARY_PUBLIC_ID_PREFIX,
    "workspaces",
    workspaceId,
    "documents",
    documentId,
    "text",
    `${randomUUID()}.txt`,
  ].join("/");
}

export function createExecutionArtifactPublicId(input: {
  readonly workspaceId: string;
  readonly sourceDocumentId: string;
  readonly executionId: string;
  readonly executionStepId: string;
}): string {
  const workspaceId = UuidSchema.parse(input.workspaceId);
  const sourceDocumentId = UuidSchema.parse(input.sourceDocumentId);
  const executionId = UuidSchema.parse(input.executionId);
  const executionStepId = UuidSchema.parse(input.executionStepId);
  return [
    CLOUDINARY_PUBLIC_ID_PREFIX,
    "workspaces",
    workspaceId,
    "documents",
    sourceDocumentId,
    "artifacts",
    executionId,
    `${executionStepId}.json`,
  ].join("/");
}

export function documentStoragePrefix(input: {
  readonly workspaceId: string;
  readonly documentId: string;
}): string {
  const workspaceId = UuidSchema.parse(input.workspaceId);
  const documentId = UuidSchema.parse(input.documentId);
  return `${CLOUDINARY_PUBLIC_ID_PREFIX}/workspaces/${workspaceId}/documents/${documentId}/`;
}

function toStoredAsset(response: UploadApiResponse): CloudinaryStoredAsset {
  return {
    publicId: response.public_id,
    resourceType: CLOUDINARY_RESOURCE_TYPE,
    deliveryType: CLOUDINARY_DELIVERY_TYPE,
    format: response.format,
    bytes: response.bytes,
    version: typeof response.version === "number" ? response.version : null,
    assetId: typeof response.asset_id === "string" ? response.asset_id : null,
    etag: typeof response.etag === "string" ? response.etag : null,
  };
}

export function createCloudinaryStorage(config: CloudinaryStorageConfig) {
  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true,
  });

  async function uploadAsset(input: {
    readonly publicId: string;
    readonly body: Uint8Array;
  }): Promise<CloudinaryStoredAsset> {
    const publicId = assertPublicId(input.publicId);
    const response = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: CLOUDINARY_RESOURCE_TYPE,
          type: CLOUDINARY_DELIVERY_TYPE,
          public_id: publicId,
          overwrite: true,
          invalidate: true,
          use_filename: false,
          unique_filename: false,
        },
        (error, result) => {
          if (error || !result) {
            reject(new CloudinaryStorageError("STORAGE_UPLOAD_FAILED", error));
            return;
          }
          resolve(result);
        },
      );
      stream.end(Buffer.from(input.body));
    });

    if (
      response.public_id !== publicId ||
      response.resource_type !== CLOUDINARY_RESOURCE_TYPE ||
      response.type !== CLOUDINARY_DELIVERY_TYPE ||
      response.bytes !== input.body.byteLength
    ) {
      throw new CloudinaryStorageError(
        "STORAGE_VERIFICATION_FAILED",
        new Error("Cloudinary upload response did not match the request."),
      );
    }
    return toStoredAsset(response);
  }

  async function inspectAsset(
    reference: CloudinaryAssetReference,
  ): Promise<CloudinaryStoredAsset | null> {
    try {
      const response = await cloudinary.api.resource(
        assertPublicId(reference.publicId),
        {
          resource_type: reference.resourceType,
          type: reference.deliveryType,
        },
      );
      if (
        typeof response.public_id !== "string" ||
        typeof response.bytes !== "number"
      ) {
        throw new CloudinaryStorageError(
          "STORAGE_VERIFICATION_FAILED",
          new Error("Cloudinary returned incomplete asset metadata."),
        );
      }
      return {
        publicId: response.public_id,
        resourceType: CLOUDINARY_RESOURCE_TYPE,
        deliveryType: CLOUDINARY_DELIVERY_TYPE,
        format:
          typeof response.format === "string"
            ? response.format
            : reference.format,
        bytes: response.bytes,
        version: typeof response.version === "number" ? response.version : null,
        assetId: typeof response.asset_id === "string" ? response.asset_id : null,
        etag: typeof response.etag === "string" ? response.etag : null,
      };
    } catch (error) {
      if (error instanceof CloudinaryStorageError) throw error;
      if (isCloudinaryNotFound(error)) return null;
      throw new CloudinaryStorageError("STORAGE_UNAVAILABLE", error);
    }
  }

  function createSignedDownloadUrl(
    reference: CloudinaryAssetReference,
    ttlSeconds: number,
  ): SignedCloudinaryUrl {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1_000);
    const expiresAtUnix = Math.floor(expiresAt.getTime() / 1_000);
    const suffix = `.${reference.format}`;
    const publicIdWithoutFormat = reference.publicId.endsWith(suffix)
      ? reference.publicId.slice(0, -suffix.length)
      : reference.publicId;
    const url = cloudinary.utils.private_download_url(
      assertPublicId(publicIdWithoutFormat),
      reference.format,
      {
        resource_type: reference.resourceType,
        type: reference.deliveryType,
        expires_at: expiresAtUnix,
        attachment: false,
      },
    );
    return { url, expiresAt };
  }

  async function downloadAsset(
    reference: CloudinaryAssetReference,
    ttlSeconds: number,
  ): Promise<Uint8Array> {
    const signed = createSignedDownloadUrl(reference, ttlSeconds);
    let response: Response;
    try {
      response = await fetch(signed.url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new CloudinaryStorageError("STORAGE_UNAVAILABLE", error);
    }
    if (response.status === 404) {
      throw new CloudinaryStorageError("STORAGE_NOT_FOUND");
    }
    if (!response.ok) {
      throw new CloudinaryStorageError(
        "STORAGE_UNAVAILABLE",
        new Error(`Cloudinary download failed with status ${response.status}.`),
      );
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  async function deleteAsset(
    reference: CloudinaryAssetReference,
  ): Promise<void> {
    try {
      const result = await cloudinary.uploader.destroy(
        assertPublicId(reference.publicId),
        {
          resource_type: reference.resourceType,
          type: reference.deliveryType,
          invalidate: true,
        },
      );
      if (
        result.result !== "ok" &&
        result.result !== "not found" &&
        result.result !== "deleted"
      ) {
        throw new CloudinaryStorageError(
          "STORAGE_UNAVAILABLE",
          new Error("Cloudinary did not confirm asset deletion."),
        );
      }
    } catch (error) {
      if (error instanceof CloudinaryStorageError) throw error;
      if (isCloudinaryNotFound(error)) return;
      throw new CloudinaryStorageError("STORAGE_UNAVAILABLE", error);
    }
  }

  async function deletePrefix(prefix: string): Promise<void> {
    if (prefix.length === 0) {
      throw new CloudinaryStorageError("STORAGE_VERIFICATION_FAILED");
    }
    try {
      let nextCursor: string | undefined;
      do {
        const result = await cloudinary.api.delete_resources_by_prefix(prefix, {
          resource_type: CLOUDINARY_RESOURCE_TYPE,
          type: CLOUDINARY_DELIVERY_TYPE,
          ...(nextCursor ? { next_cursor: nextCursor } : {}),
        });
        nextCursor =
          typeof result.next_cursor === "string" ? result.next_cursor : undefined;
      } while (nextCursor);
    } catch (error) {
      throw new CloudinaryStorageError("STORAGE_UNAVAILABLE", error);
    }
  }

  return {
    uploadAsset,
    inspectAsset,
    createSignedDownloadUrl,
    downloadAsset,
    deleteAsset,
    deletePrefix,
  };
}

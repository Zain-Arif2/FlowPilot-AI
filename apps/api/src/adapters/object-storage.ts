import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { UuidSchema } from "@flowpilot/shared";
import type { AppConfig } from "../config.js";

export class ObjectStorageError extends Error {
  constructor(
    readonly code: "STORAGE_UNAVAILABLE",
    cause: unknown,
  ) {
    super("Private object storage is temporarily unavailable.", { cause });
    this.name = "ObjectStorageError";
  }
}

export function mapObjectStorageError(cause: unknown): ObjectStorageError {
  return new ObjectStorageError("STORAGE_UNAVAILABLE", cause);
}

function isMissingObjectError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as {
    readonly name?: unknown;
    readonly $metadata?: { readonly httpStatusCode?: unknown };
  };
  return (
    candidate.name === "NotFound" ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

export interface SignedObjectUrl {
  readonly url: string;
  readonly expiresAt: Date;
}

export function createPrivateObjectKey(
  workspaceId: string,
  documentId: string,
  kind: "source" | "text",
): string {
  const safeWorkspaceId = UuidSchema.parse(workspaceId);
  const safeDocumentId = UuidSchema.parse(documentId);
  return `workspaces/${safeWorkspaceId}/documents/${safeDocumentId}/${kind}/${randomUUID()}`;
}

export function createObjectStorage(config: AppConfig) {
  const client = new S3Client({
    region: config.OBJECT_STORAGE_REGION,
    endpoint: config.OBJECT_STORAGE_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.OBJECT_STORAGE_ACCESS_KEY,
      secretAccessKey: config.OBJECT_STORAGE_SECRET_KEY,
    },
  });

  return {
    async createUploadUrl(input: {
      readonly key: string;
      readonly mediaType: string;
      readonly byteSize: number;
    }): Promise<SignedObjectUrl> {
      try {
        const command = new PutObjectCommand({
          Bucket: config.OBJECT_STORAGE_BUCKET,
          Key: input.key,
          ContentType: input.mediaType,
          ContentLength: input.byteSize,
        });
        const url = await getSignedUrl(client, command, {
          expiresIn: config.OBJECT_STORAGE_PRESIGN_TTL_SECONDS,
        });
        return {
          url,
          expiresAt: new Date(
            Date.now() + config.OBJECT_STORAGE_PRESIGN_TTL_SECONDS * 1_000,
          ),
        };
      } catch (error) {
        throw mapObjectStorageError(error);
      }
    },

    async createDownloadUrl(key: string): Promise<SignedObjectUrl> {
      try {
        const url = await getSignedUrl(
          client,
          new GetObjectCommand({ Bucket: config.OBJECT_STORAGE_BUCKET, Key: key }),
          { expiresIn: config.OBJECT_STORAGE_PRESIGN_TTL_SECONDS },
        );
        return {
          url,
          expiresAt: new Date(
            Date.now() + config.OBJECT_STORAGE_PRESIGN_TTL_SECONDS * 1_000,
          ),
        };
      } catch (error) {
        throw mapObjectStorageError(error);
      }
    },

    async headObject(key: string): Promise<{
      readonly byteSize: number;
      readonly mediaType: string | null;
    } | null> {
      try {
        const result = await client.send(
          new HeadObjectCommand({ Bucket: config.OBJECT_STORAGE_BUCKET, Key: key }),
        );
        if (typeof result.ContentLength !== "number") {
          throw new Error("Object storage did not return an object size.");
        }
        return {
          byteSize: result.ContentLength,
          mediaType: result.ContentType ?? null,
        };
      } catch (error) {
        if (isMissingObjectError(error)) return null;
        throw mapObjectStorageError(error);
      }
    },

    async readObject(key: string): Promise<Uint8Array> {
      try {
        const result = await client.send(
          new GetObjectCommand({ Bucket: config.OBJECT_STORAGE_BUCKET, Key: key }),
        );
        if (!result.Body) throw new Error("Object storage returned an empty body.");
        return await result.Body.transformToByteArray();
      } catch (error) {
        throw mapObjectStorageError(error);
      }
    },

    async putObject(input: {
      readonly key: string;
      readonly body: Uint8Array;
      readonly mediaType: string;
    }): Promise<void> {
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: config.OBJECT_STORAGE_BUCKET,
            Key: input.key,
            Body: input.body,
            ContentType: input.mediaType,
          }),
        );
      } catch (error) {
        throw mapObjectStorageError(error);
      }
    },

    async deleteObject(key: string): Promise<void> {
      try {
        await client.send(
          new DeleteObjectCommand({ Bucket: config.OBJECT_STORAGE_BUCKET, Key: key }),
        );
      } catch (error) {
        throw mapObjectStorageError(error);
      }
    },
  };
}

import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { UuidSchema } from "@flowpilot/shared";

export interface WorkerStorageConfig {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKey: string;
  readonly secretKey: string;
}

export function createWorkerObjectStorage(config: WorkerStorageConfig) {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
  });

  const deleteObject = async (key: string): Promise<void> => {
    await client.send(
      new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
    );
  };

  return {
    async readObject(key: string): Promise<Uint8Array> {
      const response = await client.send(
        new GetObjectCommand({ Bucket: config.bucket, Key: key }),
      );
      if (!response.Body) throw new Error("Object storage returned an empty body.");
      return response.Body.transformToByteArray();
    },

    async putObject(input: {
      readonly key: string;
      readonly body: Uint8Array;
      readonly mediaType: string;
    }): Promise<void> {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.mediaType,
        }),
      );
    },

    async deleteObject(key: string): Promise<void> {
      await deleteObject(key);
    },

    async deletePrefix(prefix: string): Promise<void> {
      let continuationToken: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({
            Bucket: config.bucket,
            Prefix: prefix,
            ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
          }),
        );
        const keys = (page.Contents ?? [])
          .map((object) => object.Key)
          .filter((key): key is string => typeof key === "string");
        for (const key of keys) await deleteObject(key);
        if (page.IsTruncated && !page.NextContinuationToken) {
          throw new Error("Object storage omitted a continuation token.");
        }
        continuationToken = page.IsTruncated
          ? page.NextContinuationToken
          : undefined;
      } while (continuationToken);
    },
  };
}

export function createDocumentTextKey(
  workspaceId: string,
  documentId: string,
): string {
  const safeWorkspaceId = UuidSchema.parse(workspaceId);
  const safeDocumentId = UuidSchema.parse(documentId);
  return `workspaces/${safeWorkspaceId}/documents/${safeDocumentId}/text/validated.txt`;
}

export function createExecutionArtifactKey(input: {
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
    "workspaces",
    workspaceId,
    "documents",
    sourceDocumentId,
    "artifacts",
    executionId,
    `${executionStepId}.json`,
  ].join("/");
}

export type ReturnTypeOfWorkerStorage = ReturnType<
  typeof createWorkerObjectStorage
>;

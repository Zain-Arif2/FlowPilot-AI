import { createCloudinaryStorage, type CloudinaryStorageConfig, createDocumentSourcePublicId as createDocumentSourceKey, createDocumentTextPublicId as createDocumentTextKey, createExecutionArtifactPublicId as createExecutionArtifactKey, CLOUDINARY_RESOURCE_TYPE, CLOUDINARY_DELIVERY_TYPE } from "@flowpilot/shared/storage/cloudinary";

// Re-export key-generation helpers for the worker processor.
export {
  createDocumentSourceKey,
  createDocumentTextKey,
  createExecutionArtifactKey,
};

export type WorkerStorageConfig = CloudinaryStorageConfig;

/**
 * Wrapper around the Cloudinary storage to provide the generic object storage API expected by the worker.
 * Maps:
 *   readObject   -> downloadAsset (authenticated raw, 300s TTL)
 *   putObject    -> uploadAsset
 *   deleteObject -> deleteAsset (authenticated raw)
 */
export function createWorkerObjectStorage(config: WorkerStorageConfig) {
  const storage = createCloudinaryStorage(config);
  return {
    // Preserve original Cloudinary storage methods
    ...storage,
    // Generic object storage API expected by workers
    async readObject(publicId: string): Promise<Uint8Array> {
      return storage.downloadAsset(
        { publicId, resourceType: CLOUDINARY_RESOURCE_TYPE, deliveryType: CLOUDINARY_DELIVERY_TYPE, format: "" },
        300,
      );
    },
    async putObject({ key, body }: { key: string; body: Uint8Array; mediaType: string }): Promise<void> {
      await storage.uploadAsset({ publicId: key, body });
    },
    async deleteObject(key: string): Promise<void> {
      await storage.deleteAsset({ publicId: key, resourceType: CLOUDINARY_RESOURCE_TYPE, deliveryType: CLOUDINARY_DELIVERY_TYPE, format: "" });
    },
  } as const;
}


export type ReturnTypeOfWorkerStorage = ReturnType<typeof createWorkerObjectStorage>;

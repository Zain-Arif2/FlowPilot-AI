import type { TenantContext } from "@flowpilot/db/tenant-transaction";
import type { CleanupJob } from "../queue/contracts.js";
import type { ReturnTypeOfWorkerStorage } from "../adapters/object-storage.js";
import { workerLogger } from "../logger.js";

interface DocumentCleanupRepository {
  findById(
    context: TenantContext,
    documentId: string,
  ): Promise<{ readonly id: string; readonly status: string } | null>;
  completeDeletion(context: TenantContext, documentId: string): Promise<void>;
}

interface ExecutionArtifactCleanupRepository {
  listForExecution(
    context: TenantContext,
    executionId: string,
  ): Promise<ReadonlyArray<{ readonly objectKey: string }>>;
  deleteForExecution(context: TenantContext, executionId: string): Promise<unknown>;
}

export function createCleanupProcessor(
  documents: DocumentCleanupRepository,
  artifacts: ExecutionArtifactCleanupRepository,
  storage: Pick<ReturnTypeOfWorkerStorage, "deleteObject" | "deletePrefix">,
) {
  return async (job: CleanupJob): Promise<void> => {
    const context = { userId: job.userId, workspaceId: job.workspaceId };

    if (job.cleanupType === "document") {
      const document = await documents.findById(context, job.aggregateId);
      if (!document || document.status !== "deleting") return;
      await storage.deletePrefix(
        `workspaces/${job.workspaceId}/documents/${document.id}/`,
      );
      await documents.completeDeletion(context, document.id);
      workerLogger.info(
        { documentId: document.id, workspaceId: job.workspaceId },
        "Document content removed",
      );
      return;
    }

    const executionArtifacts = await artifacts.listForExecution(
      context,
      job.aggregateId,
    );
    for (const artifact of executionArtifacts) {
      await storage.deleteObject(artifact.objectKey);
    }
    await artifacts.deleteForExecution(context, job.aggregateId);
    workerLogger.info(
      { executionId: job.aggregateId, workspaceId: job.workspaceId },
      "Execution artifacts removed",
    );
  };
}

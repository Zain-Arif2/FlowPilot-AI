import { z } from "zod";
import { UuidSchema } from "@flowpilot/shared";

export const WorkflowExecutionJobSchema = z
  .object({
    executionId: UuidSchema,
    workspaceId: UuidSchema,
    userId: UuidSchema,
  })
  .strict();

export const OutboxDispatchJobSchema = z
  .object({
    outboxEventId: UuidSchema,
  })
  .strict();

export const DocumentValidationJobSchema = z
  .object({
    documentId: UuidSchema,
    workspaceId: UuidSchema,
    userId: UuidSchema,
  })
  .strict();

export const CleanupJobSchema = z
  .object({
    cleanupType: z.enum(["document", "execution_artifacts"]),
    aggregateId: UuidSchema,
    workspaceId: UuidSchema,
    userId: UuidSchema,
  })
  .strict();

export type WorkflowExecutionJob = z.infer<typeof WorkflowExecutionJobSchema>;
export type OutboxDispatchJob = z.infer<typeof OutboxDispatchJobSchema>;
export type DocumentValidationJob = z.infer<typeof DocumentValidationJobSchema>;
export type CleanupJob = z.infer<typeof CleanupJobSchema>;

export const WORKFLOW_QUEUE = "flowpilot-workflows";
export const OUTBOX_QUEUE = "flowpilot-outbox";
export const DOCUMENT_QUEUE = "flowpilot-documents";
export const CLEANUP_QUEUE = "flowpilot-cleanup";

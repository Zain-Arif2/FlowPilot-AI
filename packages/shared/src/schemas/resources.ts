import { z } from "zod";
import { UuidSchema } from "./common.js";
import { WorkflowDefinitionSchema } from "../workflow/schema.js";

export const DocumentMediaTypeSchema = z.enum([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

/**
 * Absolute product ceiling. Cloudinary plan file-size limits can be lower
 * (Free: 10 MB raw files, Plus: 20 MB, Advanced: 40 MB), so the API enforces
 * the configured DOCUMENT_MAX_BYTES value in addition to this schema ceiling.
 */
export const DOCUMENT_MAX_BYTES = 20_000_000;

export const DocumentStatusSchema = z.enum([
  "uploading",
  "validating",
  "ready",
  "failed",
  "deleting",
]);

export const DocumentUploadRequestSchema = z
  .object({
    filename: z.string().min(1).max(255),
    mediaType: DocumentMediaTypeSchema,
    byteSize: z.number().int().min(1).max(DOCUMENT_MAX_BYTES),
  })
  .strict();

export const DocumentSchema = z
  .object({
    id: UuidSchema,
    status: DocumentStatusSchema,
    filename: z.string().min(1).max(255),
    mediaType: DocumentMediaTypeSchema,
    byteSize: z.number().int().min(1).max(DOCUMENT_MAX_BYTES),
    failureCode: z.string().optional(),
    createdAt: z.string().datetime(),
  })
  .strict();

export const DocumentUploadIntentSchema = z
  .object({
    document: DocumentSchema,
    /** Relative API path; the browser uploads the raw file body to this endpoint. */
    uploadUrl: z.string().min(1),
    expiresAt: z.string().datetime(),
    /** Configured server-side limit for this deployment. */
    maxUploadBytes: z.number().int().positive(),
  })
  .strict();

export const DocumentUploadLimitsSchema = z
  .object({
    maxUploadBytes: z.number().int().positive(),
  })
  .strict();

export const DocumentListSchema = z.array(DocumentSchema);

export const WorkflowProposalRequestSchema = z
  .object({
    prompt: z.string().trim().min(1).max(10_000),
    documentId: UuidSchema.optional(),
  })
  .strict();

export const SaveWorkflowRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    definition: WorkflowDefinitionSchema,
  })
  .strict();

export const WorkflowSchema = z
  .object({
    id: UuidSchema,
    name: z.string().min(1).max(120),
    revision: z.number().int().positive(),
    definition: WorkflowDefinitionSchema,
    updatedAt: z.string().datetime(),
  })
  .strict();

export const WorkflowListSchema = z.array(WorkflowSchema);

export const WorkflowProposalSchema = z
  .object({
    definition: WorkflowDefinitionSchema,
    warnings: z.array(z.string().max(500)).max(20),
  })
  .strict();

export const ReportContentSchema = z
  .object({
    summary: z.string().optional(),
    dates: z.array(z.string()).optional(),
    actionItems: z.array(z.string()).optional(),
  })
  .strict();

export const ReportSchema = z
  .object({
    id: UuidSchema,
    title: z.string().min(1).max(120),
    revision: z.number().int().positive(),
    content: ReportContentSchema,
  })
  .strict();

export const ReportListSchema = z.array(ReportSchema);

export const ApprovalStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);

export const ApprovalSchema = z
  .object({
    id: UuidSchema,
    workspaceId: UuidSchema,
    executionId: UuidSchema,
    actionType: z.literal("replace_report"),
    targetReportId: UuidSchema,
    expectedReportRevision: z.number().int().positive(),
    status: ApprovalStatusSchema,
    requestedAt: z.string().datetime(),
    decidedAt: z.string().datetime().optional(),
  })
  .strict();

export const ApprovalListSchema = z.array(ApprovalSchema);

export const ApprovalDetailSchema = ApprovalSchema.extend({
  proposedContent: ReportContentSchema.nullable(),
}).strict();

export const ApprovalDecisionRequestSchema = z
  .object({
    decision: z.enum(["approved", "rejected"]),
  })
  .strict();

export const ExecutionStatusSchema = z.enum([
  "queued",
  "running",
  "waiting_approval",
  "succeeded",
  "failed",
  "cancelled",
]);

export const ExecutionStepSchema = z
  .object({
    stepId: z.string().min(1).max(64),
    actionType: z
      .enum([
        "extract_document",
        "analyze_document",
        "create_report",
        "replace_report",
        "condition",
      ])
      .optional(),
    status: z.enum([
      "pending",
      "running",
      "waiting_approval",
      "succeeded",
      "failed",
      "skipped",
    ]),
    errorCode: z.string().optional(),
  })
  .strict();

export const ExecutionAttemptSchema = z
  .object({
    attemptNumber: z.number().int().positive(),
    status: z.enum(["running", "succeeded", "failed"]),
    startedAt: z.string().datetime(),
    finishedAt: z.string().datetime().optional(),
    errorCode: z.string().regex(/^[A-Z0-9_]{1,64}$/).optional(),
  })
  .strict();

export const ExecutionHistoryStepSchema = ExecutionStepSchema.extend({
  attempts: z.array(ExecutionAttemptSchema),
}).strict();

export const ExecutionEventSchema = z
  .object({
    eventType: z.string().min(1).max(64),
    stepId: z.string().min(1).max(64).optional(),
    details: z
      .object({
        state: z.string().regex(/^[a-z_]{1,64}$/).optional(),
        errorCode: z.string().regex(/^[A-Z0-9_]{1,64}$/).optional(),
        attemptNumber: z.number().int().nonnegative().optional(),
        elapsedMs: z.number().int().nonnegative().optional(),
      })
      .strict(),
    createdAt: z.string().datetime(),
  })
  .strict();

export const ExecutionSchema = z
  .object({
    id: UuidSchema,
    workflowId: UuidSchema,
    status: ExecutionStatusSchema,
    createdAt: z.string().datetime(),
    steps: z.array(ExecutionStepSchema).optional(),
    events: z.array(ExecutionEventSchema).optional(),
    errorCode: z.string().regex(/^[A-Z0-9_]{1,64}$/).optional(),
  })
  .strict();

export const ExecutionDetailSchema = ExecutionSchema.extend({
  steps: z.array(ExecutionHistoryStepSchema),
  events: z.array(ExecutionEventSchema),
}).strict();

export const ExecutionListSchema = z.array(ExecutionSchema);

export const RetryExecutionRequestSchema = z
  .object({ stepId: z.string().min(1).max(64) })
  .strict();

export const StartExecutionRequestSchema = z
  .object({
    workflowRevision: z.number().int().positive(),
    documentId: UuidSchema.optional(),
  })
  .strict();

export type DocumentUploadRequest = z.infer<typeof DocumentUploadRequestSchema>;
export type DocumentDto = z.infer<typeof DocumentSchema>;
export type DocumentUploadIntent = z.infer<typeof DocumentUploadIntentSchema>;
export type WorkflowProposalRequest = z.infer<typeof WorkflowProposalRequestSchema>;
export type SaveWorkflowRequest = z.infer<typeof SaveWorkflowRequestSchema>;
export type WorkflowDto = z.infer<typeof WorkflowSchema>;
export type WorkflowProposal = z.infer<typeof WorkflowProposalSchema>;
export type ReportContent = z.infer<typeof ReportContentSchema>;
export type ReportDto = z.infer<typeof ReportSchema>;
export type ApprovalDto = z.infer<typeof ApprovalSchema>;
export type ApprovalDetailDto = z.infer<typeof ApprovalDetailSchema>;
export type ApprovalDecisionRequest = z.infer<typeof ApprovalDecisionRequestSchema>;
export type ExecutionDto = z.infer<typeof ExecutionSchema>;
export type ExecutionDetailDto = z.infer<typeof ExecutionDetailSchema>;
export type RetryExecutionRequest = z.infer<typeof RetryExecutionRequestSchema>;
export type StartExecutionRequest = z.infer<typeof StartExecutionRequestSchema>;

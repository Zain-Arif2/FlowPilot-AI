import { z } from "zod";
import { UuidSchema } from "./common.js";
import { WorkflowDefinitionSchema } from "../workflow/schema.js";

export const DocumentMediaTypeSchema = z.enum([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

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
    byteSize: z.number().int().min(1).max(20_000_000),
  })
  .strict();

export const DocumentSchema = z
  .object({
    id: UuidSchema,
    status: DocumentStatusSchema,
    filename: z.string().min(1).max(255),
    mediaType: DocumentMediaTypeSchema,
    byteSize: z.number().int().min(1).max(20_000_000),
    failureCode: z.string().optional(),
    createdAt: z.string().datetime(),
  })
  .strict();

export const DocumentUploadIntentSchema = z
  .object({
    document: DocumentSchema,
    uploadUrl: z.string().url(),
    expiresAt: z.string().datetime(),
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

export const ExecutionSchema = z
  .object({
    id: UuidSchema,
    workflowId: UuidSchema,
    status: ExecutionStatusSchema,
    createdAt: z.string().datetime(),
    steps: z.array(ExecutionStepSchema).optional(),
  })
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
export type StartExecutionRequest = z.infer<typeof StartExecutionRequestSchema>;

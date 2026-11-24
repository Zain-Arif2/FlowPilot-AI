-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('uploading', 'validating', 'ready', 'failed', 'deleting');

-- CreateEnum
CREATE TYPE "DocumentMediaType" AS ENUM ('pdf', 'docx', 'txt');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "ApprovalActionType" AS ENUM ('replace_report');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('queued', 'running', 'waiting_approval', 'succeeded', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('pending', 'running', 'waiting_approval', 'succeeded', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "revokedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "uploadedById" UUID NOT NULL,
    "originalName" TEXT NOT NULL,
    "mediaType" "DocumentMediaType" NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "pageCount" INTEGER,
    "textCharacterCount" INTEGER,
    "sourceObjectKey" TEXT NOT NULL,
    "textObjectKey" TEXT,
    "checksum" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'uploading',
    "failureCode" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workflow" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "definitionVersion" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Execution" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "workflowId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "documentId" UUID,
    "workflowRevision" INTEGER NOT NULL,
    "workflowSnapshot" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'queued',
    "startedAt" TIMESTAMPTZ(6),
    "finishedAt" TIMESTAMPTZ(6),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Execution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionStep" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "executionId" UUID NOT NULL,
    "nodeId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "status" "StepStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ExecutionStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepAttempt" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "executionStepId" UUID NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(6),
    "errorCode" TEXT,
    "errorMessage" TEXT,

    CONSTRAINT "StepAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionEvent" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "executionId" UUID NOT NULL,
    "executionStepId" UUID,
    "eventType" TEXT NOT NULL,
    "safeDetails" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "sourceDocumentId" UUID NOT NULL,
    "sourceExecutionId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "executionId" UUID NOT NULL,
    "executionStepId" UUID NOT NULL,
    "actionType" "ApprovalActionType" NOT NULL,
    "targetReportId" UUID NOT NULL,
    "expectedReportRevision" INTEGER NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "requestedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMPTZ(6),
    "decidedById" UUID,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingReport" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "approvalId" UUID NOT NULL,
    "reportId" UUID NOT NULL,
    "sourceDocumentId" UUID NOT NULL,
    "expectedReportRevision" INTEGER NOT NULL,
    "proposedContent" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" UUID NOT NULL,
    "eventKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateId" UUID NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMPTZ(6),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "Workspace_ownerId_createdAt_idx" ON "Workspace"("ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_id_ownerId_key" ON "Workspace"("id", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_sourceObjectKey_key" ON "Document"("sourceObjectKey");

-- CreateIndex
CREATE UNIQUE INDEX "Document_textObjectKey_key" ON "Document"("textObjectKey");

-- CreateIndex
CREATE INDEX "Document_workspaceId_createdAt_idx" ON "Document"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Document_uploadedById_idx" ON "Document"("uploadedById");

-- CreateIndex
CREATE UNIQUE INDEX "Document_workspaceId_id_key" ON "Document"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "Workflow_workspaceId_updatedAt_idx" ON "Workflow"("workspaceId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Workflow_workspaceId_id_key" ON "Workflow"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "Execution_workspaceId_createdAt_idx" ON "Execution"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Execution_workspaceId_status_createdAt_idx" ON "Execution"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Execution_workspaceId_workflowId_idx" ON "Execution"("workspaceId", "workflowId");

-- CreateIndex
CREATE INDEX "Execution_workspaceId_documentId_idx" ON "Execution"("workspaceId", "documentId");

-- CreateIndex
CREATE INDEX "Execution_workspaceId_createdById_idx" ON "Execution"("workspaceId", "createdById");

-- CreateIndex
CREATE UNIQUE INDEX "Execution_workspaceId_id_key" ON "Execution"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Execution_workspaceId_createdById_idempotencyKey_key" ON "Execution"("workspaceId", "createdById", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ExecutionStep_workspaceId_status_idx" ON "ExecutionStep"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "ExecutionStep_workspaceId_executionId_idx" ON "ExecutionStep"("workspaceId", "executionId");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionStep_workspaceId_id_key" ON "ExecutionStep"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionStep_executionId_nodeId_key" ON "ExecutionStep"("executionId", "nodeId");

-- CreateIndex
CREATE INDEX "StepAttempt_workspaceId_executionStepId_idx" ON "StepAttempt"("workspaceId", "executionStepId");

-- CreateIndex
CREATE UNIQUE INDEX "StepAttempt_workspaceId_id_key" ON "StepAttempt"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "StepAttempt_executionStepId_attemptNumber_key" ON "StepAttempt"("executionStepId", "attemptNumber");

-- CreateIndex
CREATE INDEX "ExecutionEvent_workspaceId_executionId_createdAt_idx" ON "ExecutionEvent"("workspaceId", "executionId", "createdAt");

-- CreateIndex
CREATE INDEX "ExecutionEvent_workspaceId_executionStepId_idx" ON "ExecutionEvent"("workspaceId", "executionStepId");

-- CreateIndex
CREATE INDEX "Report_workspaceId_createdAt_idx" ON "Report"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Report_workspaceId_sourceDocumentId_idx" ON "Report"("workspaceId", "sourceDocumentId");

-- CreateIndex
CREATE INDEX "Report_workspaceId_sourceExecutionId_idx" ON "Report"("workspaceId", "sourceExecutionId");

-- CreateIndex
CREATE UNIQUE INDEX "Report_workspaceId_id_key" ON "Report"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "Approval_workspaceId_status_requestedAt_idx" ON "Approval"("workspaceId", "status", "requestedAt");

-- CreateIndex
CREATE INDEX "Approval_workspaceId_executionId_idx" ON "Approval"("workspaceId", "executionId");

-- CreateIndex
CREATE INDEX "Approval_workspaceId_targetReportId_idx" ON "Approval"("workspaceId", "targetReportId");

-- CreateIndex
CREATE INDEX "Approval_workspaceId_decidedById_idx" ON "Approval"("workspaceId", "decidedById");

-- CreateIndex
CREATE UNIQUE INDEX "Approval_workspaceId_id_key" ON "Approval"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Approval_executionStepId_key" ON "Approval"("executionStepId");

-- CreateIndex
CREATE UNIQUE INDEX "Approval_workspaceId_executionStepId_key" ON "Approval"("workspaceId", "executionStepId");

-- CreateIndex
CREATE INDEX "PendingReport_workspaceId_reportId_idx" ON "PendingReport"("workspaceId", "reportId");

-- CreateIndex
CREATE INDEX "PendingReport_workspaceId_sourceDocumentId_idx" ON "PendingReport"("workspaceId", "sourceDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "PendingReport_workspaceId_id_key" ON "PendingReport"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PendingReport_workspaceId_approvalId_key" ON "PendingReport"("workspaceId", "approvalId");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxEvent_eventKey_key" ON "OutboxEvent"("eventKey");

-- CreateIndex
CREATE INDEX "OutboxEvent_publishedAt_createdAt_idx" ON "OutboxEvent"("publishedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_workspaceId_uploadedById_fkey" FOREIGN KEY ("workspaceId", "uploadedById") REFERENCES "Workspace"("id", "ownerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_workspaceId_workflowId_fkey" FOREIGN KEY ("workspaceId", "workflowId") REFERENCES "Workflow"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_workspaceId_documentId_fkey" FOREIGN KEY ("workspaceId", "documentId") REFERENCES "Document"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_workspaceId_createdById_fkey" FOREIGN KEY ("workspaceId", "createdById") REFERENCES "Workspace"("id", "ownerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionStep" ADD CONSTRAINT "ExecutionStep_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionStep" ADD CONSTRAINT "ExecutionStep_workspaceId_executionId_fkey" FOREIGN KEY ("workspaceId", "executionId") REFERENCES "Execution"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepAttempt" ADD CONSTRAINT "StepAttempt_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepAttempt" ADD CONSTRAINT "StepAttempt_workspaceId_executionStepId_fkey" FOREIGN KEY ("workspaceId", "executionStepId") REFERENCES "ExecutionStep"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionEvent" ADD CONSTRAINT "ExecutionEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionEvent" ADD CONSTRAINT "ExecutionEvent_workspaceId_executionId_fkey" FOREIGN KEY ("workspaceId", "executionId") REFERENCES "Execution"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionEvent" ADD CONSTRAINT "ExecutionEvent_workspaceId_executionStepId_fkey" FOREIGN KEY ("workspaceId", "executionStepId") REFERENCES "ExecutionStep"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_workspaceId_sourceDocumentId_fkey" FOREIGN KEY ("workspaceId", "sourceDocumentId") REFERENCES "Document"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_workspaceId_sourceExecutionId_fkey" FOREIGN KEY ("workspaceId", "sourceExecutionId") REFERENCES "Execution"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_workspaceId_executionId_fkey" FOREIGN KEY ("workspaceId", "executionId") REFERENCES "Execution"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_workspaceId_executionStepId_fkey" FOREIGN KEY ("workspaceId", "executionStepId") REFERENCES "ExecutionStep"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_workspaceId_targetReportId_fkey" FOREIGN KEY ("workspaceId", "targetReportId") REFERENCES "Report"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_workspaceId_decidedById_fkey" FOREIGN KEY ("workspaceId", "decidedById") REFERENCES "Workspace"("id", "ownerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingReport" ADD CONSTRAINT "PendingReport_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingReport" ADD CONSTRAINT "PendingReport_workspaceId_approvalId_fkey" FOREIGN KEY ("workspaceId", "approvalId") REFERENCES "Approval"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingReport" ADD CONSTRAINT "PendingReport_workspaceId_reportId_fkey" FOREIGN KEY ("workspaceId", "reportId") REFERENCES "Report"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingReport" ADD CONSTRAINT "PendingReport_workspaceId_sourceDocumentId_fkey" FOREIGN KEY ("workspaceId", "sourceDocumentId") REFERENCES "Document"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enforce data-model bounds that Prisma schema types cannot express.
ALTER TABLE "User"
  ADD CONSTRAINT "User_email_normalized_check"
  CHECK ("email" = lower("email") AND char_length("email") BETWEEN 3 AND 254),
  ADD CONSTRAINT "User_passwordHash_nonempty_check"
  CHECK (char_length("passwordHash") > 0);

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_tokenHash_sha256_check"
  CHECK ("tokenHash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "Workspace"
  ADD CONSTRAINT "Workspace_name_length_check"
  CHECK (char_length(btrim("name")) BETWEEN 1 AND 120);

ALTER TABLE "Document"
  ADD CONSTRAINT "Document_originalName_length_check"
  CHECK (char_length("originalName") BETWEEN 1 AND 255),
  ADD CONSTRAINT "Document_byteSize_bounds_check"
  CHECK ("byteSize" BETWEEN 1 AND 20000000),
  ADD CONSTRAINT "Document_pageCount_bounds_check"
  CHECK (
    "pageCount" IS NULL OR
    ("mediaType" = 'pdf' AND "pageCount" BETWEEN 1 AND 100)
  ),
  ADD CONSTRAINT "Document_textCharacterCount_bounds_check"
  CHECK (
    "textCharacterCount" IS NULL OR (
      "textCharacterCount" >= 0 AND
      ("mediaType" = 'pdf' OR "textCharacterCount" <= 300000)
    )
  ),
  ADD CONSTRAINT "Document_storage_metadata_nonempty_check"
  CHECK (
    char_length("sourceObjectKey") > 0 AND
    char_length("checksum") > 0 AND
    ("textObjectKey" IS NULL OR char_length("textObjectKey") > 0)
  );

ALTER TABLE "Workflow"
  ADD CONSTRAINT "Workflow_name_length_check"
  CHECK (char_length(btrim("name")) BETWEEN 1 AND 120),
  ADD CONSTRAINT "Workflow_revision_positive_check"
  CHECK ("revision" > 0),
  ADD CONSTRAINT "Workflow_definitionVersion_positive_check"
  CHECK ("definitionVersion" > 0);

ALTER TABLE "Execution"
  ADD CONSTRAINT "Execution_workflowRevision_positive_check"
  CHECK ("workflowRevision" > 0),
  ADD CONSTRAINT "Execution_idempotencyKey_length_check"
  CHECK (char_length("idempotencyKey") BETWEEN 1 AND 255);

ALTER TABLE "ExecutionStep"
  ADD CONSTRAINT "ExecutionStep_nodeId_length_check"
  CHECK (char_length("nodeId") BETWEEN 1 AND 64),
  ADD CONSTRAINT "ExecutionStep_actionType_length_check"
  CHECK (char_length("actionType") BETWEEN 1 AND 64);

ALTER TABLE "StepAttempt"
  ADD CONSTRAINT "StepAttempt_attemptNumber_positive_check"
  CHECK ("attemptNumber" > 0);

ALTER TABLE "ExecutionEvent"
  ADD CONSTRAINT "ExecutionEvent_eventType_length_check"
  CHECK (char_length("eventType") BETWEEN 1 AND 64);

ALTER TABLE "Report"
  ADD CONSTRAINT "Report_title_length_check"
  CHECK (char_length(btrim("title")) BETWEEN 1 AND 120),
  ADD CONSTRAINT "Report_revision_positive_check"
  CHECK ("revision" > 0);

ALTER TABLE "Approval"
  ADD CONSTRAINT "Approval_expectedReportRevision_positive_check"
  CHECK ("expectedReportRevision" > 0);

ALTER TABLE "PendingReport"
  ADD CONSTRAINT "PendingReport_expectedReportRevision_positive_check"
  CHECK ("expectedReportRevision" > 0);

ALTER TABLE "OutboxEvent"
  ADD CONSTRAINT "OutboxEvent_eventKey_nonempty_check"
  CHECK (char_length("eventKey") BETWEEN 1 AND 255),
  ADD CONSTRAINT "OutboxEvent_eventType_length_check"
  CHECK (char_length("eventType") BETWEEN 1 AND 64),
  ADD CONSTRAINT "OutboxEvent_attemptCount_nonnegative_check"
  CHECK ("attemptCount" >= 0);

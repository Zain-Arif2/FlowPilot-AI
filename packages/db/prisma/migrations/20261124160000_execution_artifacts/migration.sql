CREATE TABLE "ExecutionArtifact" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId" UUID NOT NULL,
  "executionId" UUID NOT NULL,
  "executionStepId" UUID NOT NULL,
  "sourceDocumentId" UUID,
  "objectKey" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ExecutionArtifact_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExecutionArtifact_objectKey_nonempty_check"
    CHECK (char_length("objectKey") > 0)
);

ALTER TABLE "Document" ALTER COLUMN "checksum" DROP NOT NULL;
DROP INDEX "Report_workspaceId_sourceExecutionId_idx";
CREATE UNIQUE INDEX "Report_workspaceId_sourceExecutionId_key"
  ON "Report"("workspaceId", "sourceExecutionId");

CREATE UNIQUE INDEX "ExecutionArtifact_objectKey_key"
  ON "ExecutionArtifact"("objectKey");
CREATE UNIQUE INDEX "ExecutionArtifact_workspaceId_executionStepId_key"
  ON "ExecutionArtifact"("workspaceId", "executionStepId");
CREATE UNIQUE INDEX "ExecutionArtifact_workspaceId_id_key"
  ON "ExecutionArtifact"("workspaceId", "id");
CREATE INDEX "ExecutionArtifact_workspaceId_executionId_idx"
  ON "ExecutionArtifact"("workspaceId", "executionId");
CREATE INDEX "ExecutionArtifact_workspaceId_sourceDocumentId_idx"
  ON "ExecutionArtifact"("workspaceId", "sourceDocumentId");

ALTER TABLE "ExecutionArtifact"
  ADD CONSTRAINT "ExecutionArtifact_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExecutionArtifact"
  ADD CONSTRAINT "ExecutionArtifact_workspaceId_executionId_fkey"
  FOREIGN KEY ("workspaceId", "executionId")
  REFERENCES "Execution"("workspaceId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExecutionArtifact"
  ADD CONSTRAINT "ExecutionArtifact_workspaceId_executionStepId_fkey"
  FOREIGN KEY ("workspaceId", "executionStepId")
  REFERENCES "ExecutionStep"("workspaceId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExecutionArtifact"
  ADD CONSTRAINT "ExecutionArtifact_workspaceId_sourceDocumentId_fkey"
  FOREIGN KEY ("workspaceId", "sourceDocumentId")
  REFERENCES "Document"("workspaceId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExecutionArtifact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExecutionArtifact" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ExecutionArtifact_tenant_owner_access" ON "ExecutionArtifact"
  FOR ALL
  USING (
    "workspaceId" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM "Workspace" AS owner_workspace
      WHERE owner_workspace."id" = "workspaceId"
        AND owner_workspace."ownerId" = NULLIF(current_setting('app.user_id', true), '')::uuid
    )
  )
  WITH CHECK (
    "workspaceId" = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM "Workspace" AS owner_workspace
      WHERE owner_workspace."id" = "workspaceId"
        AND owner_workspace."ownerId" = NULLIF(current_setting('app.user_id', true), '')::uuid
    )
  );

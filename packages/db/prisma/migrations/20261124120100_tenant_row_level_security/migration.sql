-- Workspace lookup is available only to the authenticated owner. A missing
-- transaction-local user context makes the predicate false.
ALTER TABLE "Workspace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Workspace" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Workspace_owner_access" ON "Workspace"
  FOR ALL
  USING ("ownerId" = NULLIF(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK ("ownerId" = NULLIF(current_setting('app.user_id', true), '')::uuid);

-- Tenant rows require both the selected workspace and its verified owner.
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Document_tenant_owner_access" ON "Document"
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

ALTER TABLE "Workflow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Workflow" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Workflow_tenant_owner_access" ON "Workflow"
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

ALTER TABLE "Execution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Execution" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Execution_tenant_owner_access" ON "Execution"
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

ALTER TABLE "ExecutionStep" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExecutionStep" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ExecutionStep_tenant_owner_access" ON "ExecutionStep"
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

ALTER TABLE "StepAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StepAttempt" FORCE ROW LEVEL SECURITY;
CREATE POLICY "StepAttempt_tenant_owner_access" ON "StepAttempt"
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

ALTER TABLE "ExecutionEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExecutionEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ExecutionEvent_tenant_owner_access" ON "ExecutionEvent"
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

ALTER TABLE "Report" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Report" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Report_tenant_owner_access" ON "Report"
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

ALTER TABLE "Approval" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Approval" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Approval_tenant_owner_access" ON "Approval"
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

ALTER TABLE "PendingReport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PendingReport" FORCE ROW LEVEL SECURITY;
CREATE POLICY "PendingReport_tenant_owner_access" ON "PendingReport"
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

"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  WorkspaceListSchema,
  WorkspaceSchema,
  type User,
  type WorkflowDefinition,
  type Workspace,
} from "@flowpilot/shared";
import { AlertCircle, FolderPlus, Plus, RefreshCw } from "lucide-react";
import { apiRequest, apiRequestVoid, getErrorMessage } from "../../lib/api.js";
import { useWorkspaceResources } from "../../hooks/use-workspace-data.js";
import { AppShell, type AppView } from "../../components/layout/app-shell.js";
import { Button } from "../../components/ui/button.js";
import { Dialog } from "../../components/ui/dialog.js";
import { EmptyState } from "../../components/ui/empty-state.js";
import { Input, Label } from "../../components/ui/input.js";
import { Skeleton } from "../../components/ui/skeleton.js";
import { useToast } from "../../components/ui/toast.js";
import { ApprovalsView } from "../approvals/approvals-view.js";
import { DashboardView } from "../dashboard/dashboard-view.js";
import { DocumentsView } from "../documents/documents-view.js";
import { ExecutionsView } from "../executions/executions-view.js";
import { SettingsView } from "../settings/settings-view.js";
import { WorkflowBuilderView } from "../workflow-builder/workflow-builder-view.js";

export function WorkspacePanel({
  user,
  onLogout,
}: {
  readonly user: User;
  readonly onLogout: () => void;
}) {
  const { notify } = useToast();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);

  const [activeView, setActiveView] = useState<AppView>("overview");
  const [builderWorkflowId, setBuilderWorkflowId] = useState<string | null>(
    null,
  );
  const [builderProposal, setBuilderProposal] = useState<{
    readonly definition: WorkflowDefinition;
    readonly warnings: readonly string[];
  } | null>(null);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(
    null,
  );

  // Create workspace dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);

  const selectedWorkspace =
    workspaces.find((workspace) => workspace.id === selectedId) ?? null;

  const resources = useWorkspaceResources(selectedWorkspace?.id);

  useEffect(() => {
    let active = true;
    apiRequest("/workspaces", WorkspaceListSchema)
      .then((items) => {
        if (!active) return;
        setWorkspaces(items);
        setSelectedId(items[0]?.id ?? "");
      })
      .catch((error: unknown) => {
        if (active) {
          notify({
            tone: "error",
            title: "Could not load workspaces",
            description: getErrorMessage(error),
          });
        }
      })
      .finally(() => {
        if (active) setLoadingWorkspaces(false);
      });
    return () => {
      active = false;
    };
  }, [notify]);

  async function handleCreateWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = newWorkspaceName.trim();
    if (!trimmed) return;
    setCreatingWorkspace(true);
    try {
      const created = await apiRequest("/workspaces", WorkspaceSchema, {
        method: "POST",
        body: { name: trimmed },
      });
      setWorkspaces((current) => [...current, created]);
      setSelectedId(created.id);
      setNewWorkspaceName("");
      setCreateDialogOpen(false);
      notify({
        tone: "success",
        title: "Workspace created",
        description: `Switched to "${created.name}".`,
      });
    } catch (error) {
      notify({
        tone: "error",
        title: "Could not create workspace",
        description: getErrorMessage(error),
      });
    } finally {
      setCreatingWorkspace(false);
    }
  }

  async function handleLogout() {
    try {
      await apiRequestVoid("/auth/logout");
      onLogout();
    } catch (error) {
      notify({
        tone: "error",
        title: "Sign out failed",
        description: getErrorMessage(error),
      });
    }
  }

  const pendingApprovalsCount = resources.approvals.filter(
    (approval) => approval.status === "pending",
  ).length;

  return (
    <>
      <AppShell
        user={user}
        workspaces={workspaces}
        selectedWorkspace={selectedWorkspace}
        loadingWorkspaces={loadingWorkspaces}
        activeView={activeView}
        pendingApprovalsCount={pendingApprovalsCount}
        onSelectView={(view) => {
          if (view !== "history") setSelectedExecutionId(null);
          if (view !== "builder") {
            setBuilderProposal(null);
          }
          setActiveView(view);
        }}
        onSelectWorkspace={(workspaceId) => {
          setSelectedId(workspaceId);
          setBuilderWorkflowId(null);
          setBuilderProposal(null);
          setSelectedExecutionId(null);
        }}
        onOpenCreateWorkspace={() => setCreateDialogOpen(true)}
        onLogout={() => void handleLogout()}
      >
        {loadingWorkspaces ? (
          <div className="mx-auto max-w-6xl space-y-6" role="status">
            <Skeleton className="h-28 w-full rounded-2xl" />
            <div className="grid gap-4 sm:grid-cols-3">
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </div>
          </div>
        ) : !selectedWorkspace ? (
          <div className="mx-auto max-w-xl py-12">
            <EmptyState
              icon={FolderPlus}
              title="Create your first workspace"
              description="Workspaces keep your documents, AI workflows, executions, and reports private and organized."
              action={
                <Button onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Create workspace
                </Button>
              }
            />
          </div>
        ) : (
          <>
            {resources.error ? (
              <div
                role="alert"
                className="mx-auto mb-5 flex max-w-6xl flex-col justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 sm:flex-row sm:items-center"
              >
                <div className="flex items-center gap-2.5">
                  <AlertCircle
                    className="h-4 w-4 shrink-0 text-rose-600"
                    aria-hidden="true"
                  />
                  <span>{resources.error}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void resources.reload()}
                  className="self-start border-rose-200 bg-white text-rose-700 hover:bg-rose-100 sm:self-auto"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  Retry
                </Button>
              </div>
            ) : null}

            {activeView === "overview" && (
              <DashboardView
                user={user}
                workspace={selectedWorkspace}
                documents={resources.documents}
                workflows={resources.workflows}
                executions={resources.executions}
                loading={resources.loading}
                onNavigate={(view) => {
                  if (view === "builder") {
                    setBuilderWorkflowId(null);
                    setBuilderProposal(null);
                  }
                  setActiveView(view);
                }}
                onOpenWorkflowInBuilder={(workflowId) => {
                  setBuilderProposal(null);
                  setBuilderWorkflowId(workflowId);
                  setActiveView("builder");
                }}
                onOpenGeneratedProposal={(definition, warnings) => {
                  setBuilderWorkflowId(null);
                  setBuilderProposal({ definition, warnings });
                  setActiveView("builder");
                }}
                onOpenExecution={(executionId) => {
                  setSelectedExecutionId(executionId);
                  setActiveView("history");
                }}
              />
            )}

            {activeView === "builder" && (
              <WorkflowBuilderView
                key={selectedWorkspace.id}
                workspace={selectedWorkspace}
                workflows={resources.workflows}
                documents={resources.documents}
                reports={resources.reports}
                initialWorkflowId={builderWorkflowId}
                initialProposal={builderProposal}
                onWorkflowSaved={(saved) => {
                  resources.setWorkflows((current) => [
                    saved,
                    ...current.filter((item) => item.id !== saved.id),
                  ]);
                }}
                onExecutionStarted={(executionId) => {
                  setSelectedExecutionId(executionId);
                  setActiveView("history");
                }}
                onReload={resources.reload}
              />
            )}

            {activeView === "documents" && (
              <DocumentsView
                workspace={selectedWorkspace}
                documents={resources.documents}
                reports={resources.reports}
                loading={resources.loading}
                onReload={resources.reload}
              />
            )}

            {activeView === "history" && (
              <ExecutionsView
                workspace={selectedWorkspace}
                workflows={resources.workflows}
                executions={resources.executions}
                loading={resources.loading}
                initialExecutionId={selectedExecutionId}
                onClearInitialExecution={() => setSelectedExecutionId(null)}
                onReload={resources.reload}
              />
            )}

            {activeView === "approvals" && (
              <ApprovalsView
                workspace={selectedWorkspace}
                approvals={resources.approvals}
                reports={resources.reports}
                loading={resources.loading}
                onReload={resources.reload}
              />
            )}

            {activeView === "settings" && (
              <SettingsView
                user={user}
                selectedWorkspace={selectedWorkspace}
                onWorkspaceRenamed={(renamed) =>
                  setWorkspaces((current) =>
                    current.map((item) =>
                      item.id === renamed.id ? renamed : item,
                    ),
                  )
                }
                onWorkspaceCreated={(created) => {
                  setWorkspaces((current) => [...current, created]);
                  setSelectedId(created.id);
                }}
                onLogout={() => void handleLogout()}
              />
            )}
          </>
        )}
      </AppShell>

      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        title="Create workspace"
        description="Organize your documents, workflows, and reports in a private workspace."
      >
        <form onSubmit={handleCreateWorkspace} className="space-y-4">
          <div>
            <Label htmlFor="modal-new-workspace" className="mb-1.5">
              Workspace name
            </Label>
            <Input
              id="modal-new-workspace"
              maxLength={120}
              minLength={1}
              required
              placeholder="e.g. Product research"
              value={newWorkspaceName}
              onChange={(event) =>
                setNewWorkspaceName(event.currentTarget.value)
              }
            />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              disabled={creatingWorkspace}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={creatingWorkspace || !newWorkspaceName.trim()}
            >
              {creatingWorkspace ? "Creating..." : "Create workspace"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

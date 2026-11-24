"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  WorkspaceListSchema,
  WorkspaceSchema,
  type User,
  type Workspace,
} from "@flowpilot/shared";
import { apiRequest, apiRequestVoid, getErrorMessage } from "../../lib/api.js";
import { DocumentWorkflowPanel } from "../documents/document-workflow-panel.js";

export function WorkspacePanel({
  user,
  onLogout,
}: {
  readonly user: User;
  readonly onLogout: () => void;
}) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const selectedWorkspace =
    workspaces.find((workspace) => workspace.id === selectedId) ?? null;

  useEffect(() => {
    let active = true;
    apiRequest("/workspaces", WorkspaceListSchema)
      .then((items) => {
        if (!active) return;
        setWorkspaces(items);
        setSelectedId(items[0]?.id ?? "");
        setWorkspaceName(items[0]?.name ?? "");
      })
      .catch((error: unknown) => {
        if (active) setErrorMessage(getErrorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setErrorMessage("");
    try {
      const workspace = await apiRequest("/workspaces", WorkspaceSchema, {
        method: "POST",
        body: { name: newWorkspaceName },
      });
      setWorkspaces((current) => [...current, workspace]);
      setSelectedId(workspace.id);
      setWorkspaceName(workspace.name);
      setNewWorkspaceName("");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function renameWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWorkspace) return;
    setBusy(true);
    setErrorMessage("");
    try {
      const renamed = await apiRequest(
        `/workspaces/${encodeURIComponent(selectedWorkspace.id)}`,
        WorkspaceSchema,
        { method: "PATCH", body: { name: workspaceName } },
      );
      setWorkspaces((current) =>
        current.map((workspace) => (workspace.id === renamed.id ? renamed : workspace)),
      );
      setWorkspaceName(renamed.name);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    setErrorMessage("");
    try {
      await apiRequestVoid("/auth/logout");
      onLogout();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="workspace-dashboard-shell">
      <section className="workspace-card" aria-labelledby="workspace-heading">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Signed in as</p>
            <h1 id="workspace-heading">{user.email}</h1>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={logout}
            disabled={busy}
          >
            Sign out
          </button>
        </header>

        <div className="workspace-content">
          <div>
            <h2>Your workspaces</h2>
            <p className="muted">
              Workspaces are private to the account that created them.
            </p>
          </div>
          {loading ? (
            <p className="muted" role="status">
              Loading your workspaces...
            </p>
          ) : workspaces.length > 0 ? (
            <label>
              Select workspace
              <select
                value={selectedId}
                onChange={(event) => {
                  const nextId = event.currentTarget.value;
                  const nextWorkspace = workspaces.find((item) => item.id === nextId);
                  setSelectedId(nextWorkspace?.id ?? "");
                  setWorkspaceName(nextWorkspace?.name ?? "");
                }}
              >
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="empty-state">Create a workspace to get started.</p>
          )}

          {selectedWorkspace && (
            <form className="form-stack" onSubmit={renameWorkspace}>
              <label>
                Workspace name
                <input
                  type="text"
                  maxLength={120}
                  minLength={1}
                  required
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.currentTarget.value)}
                />
              </label>
              <button className="secondary-button" type="submit" disabled={busy}>
                Save workspace name
              </button>
            </form>
          )}

          <form className="create-workspace-form" onSubmit={createWorkspace}>
            <label>
              New workspace name
              <input
                type="text"
                maxLength={120}
                minLength={1}
                required
                value={newWorkspaceName}
                onChange={(event) => setNewWorkspaceName(event.currentTarget.value)}
              />
            </label>
            <button className="primary-button" type="submit" disabled={busy || loading}>
              Create workspace
            </button>
          </form>

          {errorMessage && (
            <p className="error-message" role="alert">
              {errorMessage}
            </p>
          )}
        </div>
      </section>
      {selectedWorkspace && !loading && (
        <DocumentWorkflowPanel workspace={selectedWorkspace} />
      )}
    </div>
  );
}

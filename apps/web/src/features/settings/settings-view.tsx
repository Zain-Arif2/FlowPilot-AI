"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  WorkspaceSchema,
  type User,
  type Workspace,
} from "@flowpilot/shared";
import { LogOut, Plus, Save, ShieldCheck } from "lucide-react";
import { apiRequest, getErrorMessage } from "../../lib/api.js";
import { Button } from "../../components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card.js";
import { Input, Label } from "../../components/ui/input.js";
import { useToast } from "../../components/ui/toast.js";

interface SettingsViewProps {
  readonly user: User;
  readonly selectedWorkspace: Workspace | null;
  readonly onWorkspaceRenamed: (workspace: Workspace) => void;
  readonly onWorkspaceCreated: (workspace: Workspace) => void;
  readonly onLogout: () => void;
}

export function SettingsView({
  user,
  selectedWorkspace,
  onWorkspaceRenamed,
  onWorkspaceCreated,
  onLogout,
}: SettingsViewProps) {
  const { notify } = useToast();
  const [workspaceName, setWorkspaceName] = useState(
    selectedWorkspace?.name ?? "",
  );
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setWorkspaceName(selectedWorkspace?.name ?? "");
  }, [selectedWorkspace]);

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWorkspace) return;
    const trimmed = workspaceName.trim();
    if (!trimmed) {
      notify({
        tone: "warning",
        title: "Workspace name required",
        description: "Enter a name between 1 and 120 characters.",
      });
      return;
    }

    setRenaming(true);
    try {
      const updated = await apiRequest(
        `/workspaces/${encodeURIComponent(selectedWorkspace.id)}`,
        WorkspaceSchema,
        { method: "PATCH", body: { name: trimmed } },
      );
      onWorkspaceRenamed(updated);
      notify({
        tone: "success",
        title: "Workspace renamed",
        description: `Updated to "${updated.name}".`,
      });
    } catch (error) {
      notify({
        tone: "error",
        title: "Could not rename workspace",
        description: getErrorMessage(error),
      });
    } finally {
      setRenaming(false);
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = newWorkspaceName.trim();
    if (!trimmed) {
      notify({
        tone: "warning",
        title: "Workspace name required",
        description: "Enter a name for your new workspace.",
      });
      return;
    }

    setCreating(true);
    try {
      const created = await apiRequest("/workspaces", WorkspaceSchema, {
        method: "POST",
        body: { name: trimmed },
      });
      onWorkspaceCreated(created);
      setNewWorkspaceName("");
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
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {selectedWorkspace ? (
        <Card>
          <CardHeader>
            <CardTitle>Workspace settings</CardTitle>
            <CardDescription>
              Rename your active workspace. Workspaces are private to their
              creator.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleRename}
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
            >
              <div className="flex-1">
                <Label htmlFor="rename-workspace-input" className="mb-1.5">
                  Workspace name
                </Label>
                <Input
                  id="rename-workspace-input"
                  maxLength={120}
                  minLength={1}
                  required
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.currentTarget.value)}
                />
              </div>
              <Button type="submit" disabled={renaming}>
                <Save className="h-4 w-4" aria-hidden="true" />
                {renaming ? "Saving..." : "Save changes"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Create another workspace</CardTitle>
          <CardDescription>
            Separate documents, workflows, and reports into isolated
            workspaces.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleCreate}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="flex-1">
              <Label htmlFor="create-workspace-input" className="mb-1.5">
                New workspace name
              </Label>
              <Input
                id="create-workspace-input"
                maxLength={120}
                minLength={1}
                required
                placeholder="e.g. Legal reviews"
                value={newWorkspaceName}
                onChange={(event) =>
                  setNewWorkspaceName(event.currentTarget.value)
                }
              />
            </div>
            <Button type="submit" variant="secondary" disabled={creating}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {creating ? "Creating..." : "Create workspace"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account & security</CardTitle>
          <CardDescription>
            Your session is protected by HttpOnly cookies and strict tenant
            isolation.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f2effc] text-sm font-semibold text-[#6d4aff]">
              {user.email.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-medium text-[#18181f]">{user.email}</p>
              <p className="flex items-center gap-1 text-xs text-[#686876]">
                <ShieldCheck className="h-3.5 w-3.5 text-[#6d4aff]" aria-hidden="true" />
                Workspace owner
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={onLogout}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}


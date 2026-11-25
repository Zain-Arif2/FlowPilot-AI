"use client";

import { useState, type FormEvent } from "react";
import {
  WorkflowProposalSchema,
  type DocumentDto,
  type ExecutionDto,
  type User,
  type WorkflowDefinition,
  type WorkflowDto,
  type Workspace,
} from "@flowpilot/shared";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  History,
  Plus,
  Sparkles,
  Wand2,
  Workflow,
  XCircle,
} from "lucide-react";
import { apiRequest, getErrorMessage } from "../../lib/api.js";
import { formatRelativeDate } from "../../lib/utils.js";
import { Button } from "../../components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card.js";
import { EmptyState } from "../../components/ui/empty-state.js";
import { Label, Select, Textarea } from "../../components/ui/input.js";
import { Skeleton } from "../../components/ui/skeleton.js";
import { useToast } from "../../components/ui/toast.js";
import { StatusBadge } from "../../components/status-badge.js";
import type { AppView } from "../../components/layout/app-shell.js";

interface DashboardViewProps {
  readonly user: User;
  readonly workspace: Workspace;
  readonly documents: readonly DocumentDto[];
  readonly workflows: readonly WorkflowDto[];
  readonly executions: readonly ExecutionDto[];
  readonly loading: boolean;
  readonly onNavigate: (view: AppView) => void;
  readonly onOpenWorkflowInBuilder: (workflowId: string) => void;
  readonly onOpenGeneratedProposal: (
    definition: WorkflowDefinition,
    warnings: readonly string[],
  ) => void;
  readonly onOpenExecution: (executionId: string) => void;
}

export function DashboardView({
  user,
  workspace,
  documents,
  workflows,
  executions,
  loading,
  onNavigate,
  onOpenWorkflowInBuilder,
  onOpenGeneratedProposal,
  onOpenExecution,
}: DashboardViewProps) {
  const { notify } = useToast();
  const readyDocuments = documents.filter((doc) => doc.status === "ready");
  const [prompt, setPrompt] = useState("");
  const [selectedDocId, setSelectedDocId] = useState("");
  const [generating, setGenerating] = useState(false);

  const succeededCount = executions.filter(
    (item) => item.status === "succeeded",
  ).length;
  const failedCount = executions.filter(
    (item) => item.status === "failed",
  ).length;

  const displayName = user.email.split("@")[0] ?? "there";

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) {
      notify({
        tone: "warning",
        title: "Describe what you want to automate",
        description: "Enter a short workflow prompt before generating.",
      });
      return;
    }

    setGenerating(true);
    try {
      const proposal = await apiRequest(
        `/workspaces/${encodeURIComponent(workspace.id)}/workflow-proposals`,
        WorkflowProposalSchema,
        {
          method: "POST",
          body: {
            prompt: trimmed,
            ...(selectedDocId ? { documentId: selectedDocId } : {}),
          },
        },
      );
      notify({
        tone: proposal.warnings.length > 0 ? "warning" : "success",
        title: "AI workflow generated",
        description:
          proposal.warnings.length > 0
            ? `${proposal.warnings.length} note(s) to review in the builder.`
            : "Review and customize your workflow on the canvas.",
      });
      onOpenGeneratedProposal(proposal.definition, proposal.warnings);
    } catch (error) {
      notify({
        tone: "error",
        title: "Could not generate workflow",
        description: getErrorMessage(error),
      });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Welcome Banner */}
      <section className="flex flex-col justify-between gap-4 rounded-2xl border border-[#e6e6ee] bg-white p-5 shadow-[0_1px_2px_rgb(20_18_32/0.04)] sm:flex-row sm:items-center sm:p-6">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#6d4aff]">
            {workspace.name}
          </p>
          <h2 className="text-xl font-semibold tracking-tight text-[#18181f] sm:text-2xl">
            Good to see you, {displayName}
          </h2>
          <p className="text-sm text-[#686876]">
            Build visual AI workflows, process documents, and review approvals in
            one place.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          <Button variant="outline" onClick={() => onNavigate("documents")}>
            <FileText className="h-4 w-4" aria-hidden="true" />
            Upload document
          </Button>
          <Button onClick={() => onNavigate("builder")}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create workflow
          </Button>
        </div>
      </section>

      {/* AI Workflow Generator */}
      <Card className="border-[#dfd7fa] bg-gradient-to-b from-[#faf8ff] to-white">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#6d4aff] text-white">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <CardTitle>Generate a workflow with AI</CardTitle>
          </div>
          <CardDescription>
            Describe your document automation goal in plain English. FlowPilot AI
            will create a validated workflow graph you can inspect and edit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleGenerate} className="space-y-3">
            <div className="grid gap-3 md:grid-cols-[1fr_240px]">
              <div>
                <Label htmlFor="dashboard-ai-prompt" className="sr-only">
                  Workflow prompt
                </Label>
                <Textarea
                  id="dashboard-ai-prompt"
                  rows={2}
                  maxLength={10000}
                  placeholder="e.g. Extract text from the uploaded contract, analyze key dates and action items, and create a summary report."
                  value={prompt}
                  onChange={(event) => setPrompt(event.currentTarget.value)}
                  className="min-h-[72px] resize-y bg-white"
                />
              </div>
              <div className="flex flex-col justify-between gap-2.5">
                <div>
                  <Label htmlFor="dashboard-doc-select" className="mb-1">
                    Context document (optional)
                  </Label>
                  <Select
                    id="dashboard-doc-select"
                    value={selectedDocId}
                    onChange={(event) =>
                      setSelectedDocId(event.currentTarget.value)
                    }
                  >
                    <option value="">No specific document</option>
                    {readyDocuments.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.filename}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button
                  type="submit"
                  disabled={generating || !prompt.trim()}
                  className="w-full"
                >
                  <Wand2 className="h-4 w-4" aria-hidden="true" />
                  {generating ? "Generating..." : "Generate workflow"}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Key Metrics */}
      {loading ? (
        <div
          className="grid gap-4 sm:grid-cols-3"
          role="status"
          aria-label="Loading workspace metrics"
        >
          {Array.from({ length: 3 }, (_, idx) => (
            <Card key={`metric-skel-${idx}`} className="p-5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="mt-3 h-8 w-16" />
              <Skeleton className="mt-2 h-3 w-36" />
            </Card>
          ))}
        </div>
      ) : (
        <section
          aria-label="Workspace metrics"
          className="grid gap-4 sm:grid-cols-3"
        >
          <Card className="p-5 transition-shadow hover:shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#686876]">
                Total workflows
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f2effc] text-[#6d4aff]">
                <Workflow className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-[#18181f]">
              {workflows.length}
            </p>
            <p className="mt-1 text-xs text-[#7b7a89]">
              Saved in {workspace.name}
            </p>
          </Card>

          <Card className="p-5 transition-shadow hover:shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#686876]">
                Successful executions
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-[#18181f]">
              {succeededCount}
            </p>
            <p className="mt-1 text-xs text-[#7b7a89]">
              Completed without errors
            </p>
          </Card>

          <Card className="p-5 transition-shadow hover:shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#686876]">
                Failed executions
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                <XCircle className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-[#18181f]">
              {failedCount}
            </p>
            <p className="mt-1 text-xs text-[#7b7a89]">
              {failedCount > 0 ? "Review in Workflow History" : "All runs healthy"}
            </p>
          </Card>
        </section>
      )}

      {/* Recent Workflows & Recent Executions */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Workflows */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle>Recent workflows</CardTitle>
              <CardDescription>Jump back into your saved graphs</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigate("builder")}
            >
              Open builder
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }, (_, idx) => (
                  <Skeleton key={`wf-skel-${idx}`} className="h-14 w-full" />
                ))}
              </div>
            ) : workflows.length === 0 ? (
              <EmptyState
                icon={Workflow}
                title="No workflows yet"
                description="Generate one with AI above or build a workflow from scratch."
                action={
                  <Button size="sm" onClick={() => onNavigate("builder")}>
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    Create workflow
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-[#efeff4]">
                {workflows.slice(0, 5).map((wf) => (
                  <li
                    key={wf.id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#18181f]">
                        {wf.name}
                      </p>
                      <p className="text-xs text-[#7b7a89]">
                        {wf.definition.nodes.length} steps · rev {wf.revision} ·{" "}
                        {formatRelativeDate(wf.updatedAt)}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenWorkflowInBuilder(wf.id)}
                    >
                      Edit
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Recent Execution Activity */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle>Recent execution activity</CardTitle>
              <CardDescription>Latest workflow runs and status</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigate("history")}
            >
              View all
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }, (_, idx) => (
                  <Skeleton key={`exec-skel-${idx}`} className="h-14 w-full" />
                ))}
              </div>
            ) : executions.length === 0 ? (
              <EmptyState
                icon={History}
                title="No executions yet"
                description="Run a workflow on a ready document to see live execution progress here."
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onNavigate("builder")}
                  >
                    Go to Workflow Builder
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-[#efeff4]">
                {executions.slice(0, 5).map((exec) => {
                  const wfName =
                    workflows.find((w) => w.id === exec.workflowId)?.name ??
                    "Workflow run";
                  return (
                    <li
                      key={exec.id}
                      className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium text-[#18181f]">
                            {wfName}
                          </p>
                          <StatusBadge status={exec.status} />
                        </div>
                        <p className="mt-0.5 text-xs text-[#7b7a89]">
                          {formatRelativeDate(exec.createdAt)}
                          {exec.errorCode ? ` · ${exec.errorCode}` : ""}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onOpenExecution(exec.id)}
                      >
                        Details
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


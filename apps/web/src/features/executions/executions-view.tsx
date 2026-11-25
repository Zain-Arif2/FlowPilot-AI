"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ExecutionDetailSchema,
  ExecutionSchema,
  type ExecutionDetailDto,
  type ExecutionDto,
  type WorkflowDto,
  type Workspace,
} from "@flowpilot/shared";
import {
  ArrowLeft,
  Clock,
  History,
  Info,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { apiRequest, getErrorMessage } from "../../lib/api.js";
import { formatRelativeDate } from "../../lib/utils.js";
import { Badge } from "../../components/ui/badge.js";
import { Button } from "../../components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card.js";
import { EmptyState } from "../../components/ui/empty-state.js";
import { Skeleton } from "../../components/ui/skeleton.js";
import { useToast } from "../../components/ui/toast.js";
import { StatusBadge } from "../../components/status-badge.js";

const RETRYABLE_ERROR_CODES = new Set([
  "AI_PROVIDER_UNAVAILABLE",
  "DEPENDENCY_UNAVAILABLE",
]);

const RETRYABLE_ACTION_TYPES = new Set([
  "extract_document",
  "analyze_document",
  "condition",
]);

const STATUS_FILTERS = [
  { id: "all", label: "All runs" },
  { id: "running", label: "Running" },
  { id: "waiting_approval", label: "Waiting approval" },
  { id: "succeeded", label: "Succeeded" },
  { id: "failed", label: "Failed" },
] as const;

interface ExecutionsViewProps {
  readonly workspace: Workspace;
  readonly workflows: readonly WorkflowDto[];
  readonly executions: readonly ExecutionDto[];
  readonly loading: boolean;
  readonly initialExecutionId?: string | null;
  readonly onClearInitialExecution?: () => void;
  readonly onReload: () => Promise<void>;
}

export function ExecutionsView({
  workspace,
  workflows,
  executions,
  loading,
  initialExecutionId,
  onClearInitialExecution,
  onReload,
}: ExecutionsViewProps) {
  const { notify } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedDetail, setSelectedDetail] =
    useState<ExecutionDetailDto | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busyStep, setBusyStep] = useState<string | null>(null);
  const pollInFlightRef = useRef(false);

  const workspacePath = `/workspaces/${encodeURIComponent(workspace.id)}`;

  const openExecution = useCallback(
    async (executionId: string, silent = false) => {
      if (pollInFlightRef.current && silent) return;
      pollInFlightRef.current = true;
      if (!silent) setLoadingDetail(true);
      try {
        const detail = await apiRequest(
          `${workspacePath}/executions/${encodeURIComponent(executionId)}`,
          ExecutionDetailSchema,
        );
        setSelectedDetail(detail);
        if (silent && detail.status !== "queued" && detail.status !== "running") {
          void onReload();
        }
      } catch (error) {
        if (!silent) {
          notify({
            tone: "error",
            title: "Could not load execution details",
            description: getErrorMessage(error),
          });
        }
      } finally {
        pollInFlightRef.current = false;
        if (!silent) setLoadingDetail(false);
      }
    },
    [notify, onReload, workspacePath],
  );

  useEffect(() => {
    if (initialExecutionId) {
      void openExecution(initialExecutionId);
    } else {
      setSelectedDetail(null);
    }
  }, [initialExecutionId, openExecution]);

  useEffect(() => {
    const executionId = selectedDetail?.id;
    const status = selectedDetail?.status;
    if (!executionId || (status !== "queued" && status !== "running")) {
      return;
    }

    const timer = window.setInterval(() => {
      void openExecution(executionId, true);
    }, 4000);

    return () => {
      window.clearInterval(timer);
    };
  }, [selectedDetail?.id, selectedDetail?.status, openExecution]);

  async function retryStep(stepId: string) {
    if (!selectedDetail) return;
    setBusyStep(stepId);
    try {
      const updated = await apiRequest(
        `${workspacePath}/executions/${encodeURIComponent(selectedDetail.id)}/retry`,
        ExecutionSchema,
        { method: "POST", body: { stepId } },
      );
      notify({
        tone: "success",
        title: "Safe retry queued",
        description: "Completed steps will not run again.",
      });
      await Promise.all([openExecution(updated.id), onReload()]);
    } catch (error) {
      notify({
        tone: "error",
        title: "Retry failed",
        description: getErrorMessage(error),
      });
    } finally {
      setBusyStep(null);
    }
  }

  function workflowNameFor(workflowId: string): string {
    return (
      workflows.find((item) => item.id === workflowId)?.name ?? "Workflow run"
    );
  }

  const filteredExecutions =
    statusFilter === "all"
      ? executions
      : executions.filter((item) => item.status === statusFilter);

  if (loadingDetail) {
    return (
      <div className="mx-auto max-w-5xl space-y-4" role="status">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Execution Details Screen
  if (selectedDetail) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedDetail(null);
              onClearInitialExecution?.();
            }}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to Workflow History
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void openExecution(selectedDetail.id)}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Refresh details
          </Button>
        </div>

        <Card>
          <CardHeader className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <CardTitle className="text-lg">
                  {workflowNameFor(selectedDetail.workflowId)}
                </CardTitle>
                <StatusBadge status={selectedDetail.status} />
              </div>
              <CardDescription className="mt-1">
                Run ID: <code className="text-xs">{selectedDetail.id}</code> ·
                Started {formatRelativeDate(selectedDetail.createdAt)}
              </CardDescription>
            </div>
            {selectedDetail.errorCode ? (
              <Badge variant="destructive">{selectedDetail.errorCode}</Badge>
            ) : null}
          </CardHeader>
        </Card>

        {/* Steps Timeline */}
        <Card>
          <CardHeader>
            <CardTitle>Execution steps</CardTitle>
            <CardDescription>
              Step-by-step progress, attempt history, and safe retry controls.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedDetail.steps.length === 0 ? (
              <p className="text-sm text-[#686876]">No steps recorded yet.</p>
            ) : (
              <ol className="space-y-3">
                {selectedDetail.steps.map((step, index) => {
                  const canRetry =
                    selectedDetail.status === "failed" &&
                    step.status === "failed" &&
                    step.actionType !== undefined &&
                    RETRYABLE_ACTION_TYPES.has(step.actionType) &&
                    step.errorCode !== undefined &&
                    RETRYABLE_ERROR_CODES.has(step.errorCode);

                  return (
                    <li
                      key={step.stepId}
                      className="flex flex-col justify-between gap-3 rounded-xl border border-[#e6e6ee] bg-[#fafafe] p-4 sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#e9e6f7] text-[11px] font-semibold text-[#5b3be0]">
                            {index + 1}
                          </span>
                          <span className="text-sm font-semibold capitalize text-[#18181f]">
                            {(step.actionType ?? step.stepId).replaceAll("_", " ")}
                          </span>
                          <StatusBadge status={step.status} />
                        </div>
                        <div className="flex flex-wrap items-center gap-3 pl-7 text-xs text-[#686876]">
                          <span>
                            {step.attempts.length}{" "}
                            {step.attempts.length === 1 ? "attempt" : "attempts"}
                          </span>
                          {step.errorCode ? (
                            <code className="rounded bg-rose-100/80 px-1.5 py-0.5 text-[11px] font-medium text-rose-800">
                              {step.errorCode}
                            </code>
                          ) : null}
                        </div>
                      </div>

                      {canRetry ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyStep !== null}
                          onClick={() => void retryStep(step.stepId)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                          {busyStep === step.stepId
                            ? "Queueing..."
                            : "Retry safely"}
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}

            <div className="flex items-start gap-2 rounded-lg border border-[#e6e6ee] bg-[#f8f8fa] px-3.5 py-2.5 text-xs text-[#686876]">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#6d4aff]" aria-hidden="true" />
              <span>
                Safe retry is available only for transient failures on repeatable
                steps (extract, analyze, condition). Report creation and
                replacement steps are never automatically retried.
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Events Log */}
        <Card>
          <CardHeader>
            <CardTitle>Execution events</CardTitle>
            <CardDescription>
              Content-free audit trail of state transitions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedDetail.events.length === 0 ? (
              <p className="text-sm text-[#686876]">No events recorded.</p>
            ) : (
              <ol className="divide-y divide-[#efeff4]">
                {selectedDetail.events.map((event, idx) => (
                  <li
                    key={`${event.createdAt}-${event.eventType}-${idx}`}
                    className="flex flex-col justify-between gap-1 py-2.5 text-xs sm:flex-row sm:items-center"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-medium text-[#18181f]">
                        {event.eventType}
                      </span>
                      {event.stepId ? (
                        <Badge variant="outline">{event.stepId}</Badge>
                      ) : null}
                      {event.details.errorCode ? (
                        <Badge variant="destructive">
                          {event.details.errorCode}
                        </Badge>
                      ) : null}
                    </div>
                    <time
                      dateTime={event.createdAt}
                      className="flex items-center gap-1 text-[#7b7a89]"
                    >
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      {formatRelativeDate(event.createdAt)}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Workflow History Screen
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setStatusFilter(filter.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === filter.id
                  ? "bg-[#6d4aff] text-white"
                  : "border border-[#e3e2ec] bg-white text-[#545363] hover:bg-[#f4f3f8]"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void onReload()}
          disabled={loading}
          className="self-start sm:self-auto"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3" role="status" aria-label="Loading executions">
          {Array.from({ length: 4 }, (_, idx) => (
            <Skeleton key={`hist-skel-${idx}`} className="h-16 w-full" />
          ))}
        </div>
      ) : filteredExecutions.length === 0 ? (
        <EmptyState
          icon={History}
          title={
            statusFilter === "all"
              ? "No workflow executions yet"
              : `No ${statusFilter.replaceAll("_", " ")} executions`
          }
          description="Run a workflow from the Workflow Builder to track execution history and step details here."
        />
      ) : (
        <Card>
          {/* Desktop Table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#efeff4] text-xs font-medium text-[#686876]">
                  <th className="px-5 py-3.5">Workflow</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Error code</th>
                  <th className="px-4 py-3.5">Started</th>
                  <th className="px-5 py-3.5 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#efeff4]">
                {filteredExecutions.map((exec) => (
                  <tr
                    key={exec.id}
                    className="transition-colors hover:bg-[#fafafe]"
                  >
                    <td className="px-5 py-3.5 font-medium text-[#18181f]">
                      {workflowNameFor(exec.workflowId)}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={exec.status} />
                    </td>
                    <td className="px-4 py-3.5">
                      {exec.errorCode ? (
                        <code className="rounded bg-rose-50 px-1.5 py-0.5 text-xs text-rose-700">
                          {exec.errorCode}
                        </code>
                      ) : (
                        <span className="text-[#9b99ab]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-[#686876]">
                      {formatRelativeDate(exec.createdAt)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void openExecution(exec.id)}
                      >
                        Inspect run
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <ul className="divide-y divide-[#efeff4] md:hidden">
            {filteredExecutions.map((exec) => (
              <li key={exec.id} className="space-y-2.5 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#18181f]">
                      {workflowNameFor(exec.workflowId)}
                    </p>
                    <p className="text-xs text-[#686876]">
                      {formatRelativeDate(exec.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={exec.status} />
                </div>
                {exec.errorCode ? (
                  <p className="text-xs text-rose-600">
                    Error: {exec.errorCode}
                  </p>
                ) : null}
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void openExecution(exec.id)}
                  >
                    Inspect run
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}


"use client";

import { useState } from "react";
import {
  ApprovalDetailSchema,
  ApprovalSchema,
  type ApprovalDetailDto,
  type ApprovalDto,
  type ReportDto,
  type Workspace,
} from "@flowpilot/shared";
import {
  Check,
  CheckSquare,
  FileDiff,
  RefreshCw,
  ShieldAlert,
  X,
} from "lucide-react";
import { ApiRequestError, apiRequest, getErrorMessage } from "../../lib/api.js";
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
import { ConfirmDialog } from "../../components/ui/dialog.js";
import { EmptyState } from "../../components/ui/empty-state.js";
import { Skeleton } from "../../components/ui/skeleton.js";
import { useToast } from "../../components/ui/toast.js";
import { StatusBadge } from "../../components/status-badge.js";

interface ApprovalsViewProps {
  readonly workspace: Workspace;
  readonly approvals: readonly ApprovalDto[];
  readonly reports: readonly ReportDto[];
  readonly loading: boolean;
  readonly onReload: () => Promise<void>;
}

export function ApprovalsView({
  workspace,
  approvals,
  reports,
  loading,
  onReload,
}: ApprovalsViewProps) {
  const { notify } = useToast();
  const [selectedDetail, setSelectedDetail] =
    useState<ApprovalDetailDto | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [confirmRejectOpen, setConfirmRejectOpen] = useState(false);

  const pendingApprovals = approvals.filter((a) => a.status === "pending");
  const pastApprovals = approvals.filter((a) => a.status !== "pending");

  async function inspectApproval(approvalId: string) {
    setLoadingDetail(true);
    try {
      const detail = await apiRequest(
        `/workspaces/${encodeURIComponent(workspace.id)}/approvals/${encodeURIComponent(approvalId)}`,
        ApprovalDetailSchema,
      );
      setSelectedDetail(detail);
    } catch (error) {
      notify({
        tone: "error",
        title: "Could not load approval details",
        description: getErrorMessage(error),
      });
    } finally {
      setLoadingDetail(false);
    }
  }

  async function submitDecision(decision: "approved" | "rejected") {
    if (!selectedDetail) return;
    setDeciding(true);
    try {
      await apiRequest(
        `/workspaces/${encodeURIComponent(workspace.id)}/approvals/${encodeURIComponent(selectedDetail.id)}/decision`,
        ApprovalSchema,
        { method: "POST", body: { decision } },
      );
      notify({
        tone: decision === "approved" ? "success" : "warning",
        title:
          decision === "approved" ? "Approval recorded" : "Approval rejected",
        description:
          decision === "approved"
            ? "The report replacement is committed and the workflow will continue."
            : "The proposed replacement was discarded and the workflow stopped.",
      });
      setSelectedDetail(null);
      setConfirmRejectOpen(false);
      await onReload();
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) {
        setSelectedDetail(null);
        setConfirmRejectOpen(false);
        await onReload();
        notify({
          tone: "warning",
          title: "Report revision changed",
          description: getErrorMessage(error),
        });
      } else {
        notify({
          tone: "error",
          title: "Decision failed",
          description: getErrorMessage(error),
        });
      }
    } finally {
      setDeciding(false);
    }
  }

  function reportTitleFor(reportId: string): string {
    return (
      reports.find((r) => r.id === reportId)?.title ?? `Report ${reportId.slice(0, 8)}`
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-[#686876]">
            Review and approve pending report replacements before they overwrite
            existing workspace reports.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void onReload()}
          disabled={loading}
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2" role="status">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      ) : approvals.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="No approvals needed"
          description="When a workflow attempts to replace an existing report, it will pause here for your explicit review."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
          {/* Approval Queue */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  Pending review
                  <Badge variant="purple">{pendingApprovals.length}</Badge>
                </CardTitle>
                <CardDescription>
                  Select an item to inspect proposed content.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {pendingApprovals.length === 0 ? (
                  <p className="text-sm text-[#686876]">
                    All caught up — no pending approvals.
                  </p>
                ) : (
                  <ul className="space-y-2.5">
                    {pendingApprovals.map((approval) => (
                      <li key={approval.id}>
                        <button
                          type="button"
                          onClick={() => void inspectApproval(approval.id)}
                          className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3.5 text-left transition-colors ${
                            selectedDetail?.id === approval.id
                              ? "border-[#6d4aff] bg-[#f2effc]/60"
                              : "border-[#e6e6ee] bg-white hover:bg-[#fafafe]"
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-[#18181f]">
                              Replace: {reportTitleFor(approval.targetReportId)}
                            </p>
                            <p className="mt-0.5 text-xs text-[#686876]">
                              Expected rev {approval.expectedReportRevision} ·{" "}
                              {formatRelativeDate(approval.requestedAt)}
                            </p>
                          </div>
                          <StatusBadge status={approval.status} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {pastApprovals.length > 0 ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Past decisions</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y divide-[#efeff4]">
                    {pastApprovals.slice(0, 10).map((approval) => (
                      <li
                        key={approval.id}
                        className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-[#18181f]">
                            {reportTitleFor(approval.targetReportId)}
                          </p>
                          <p className="text-[11px] text-[#7b7a89]">
                            {formatRelativeDate(
                              approval.decidedAt ?? approval.requestedAt,
                            )}
                          </p>
                        </div>
                        <StatusBadge status={approval.status} />
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}
          </div>

          {/* Detail Inspector */}
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileDiff className="h-4 w-4 text-[#6d4aff]" aria-hidden="true" />
                Approval inspector
              </CardTitle>
              <CardDescription>
                Verify the proposed replacement before approving.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingDetail ? (
                <div className="space-y-3" role="status">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : !selectedDetail ? (
                <EmptyState
                  icon={ShieldAlert}
                  title="Select an approval"
                  description="Choose a pending approval on the left to review its proposed report content."
                />
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 rounded-xl border border-[#efeff4] bg-[#fafafe] p-3.5 text-xs sm:grid-cols-2">
                    <div>
                      <span className="text-[#686876]">Action type</span>
                      <p className="mt-0.5 font-semibold text-[#18181f]">
                        {selectedDetail.actionType.replaceAll("_", " ")}
                      </p>
                    </div>
                    <div>
                      <span className="text-[#686876]">Target report</span>
                      <p className="mt-0.5 truncate font-semibold text-[#18181f]">
                        {reportTitleFor(selectedDetail.targetReportId)}
                      </p>
                    </div>
                    <div>
                      <span className="text-[#686876]">Expected revision</span>
                      <p className="mt-0.5 font-semibold text-[#18181f]">
                        Rev {selectedDetail.expectedReportRevision}
                      </p>
                    </div>
                    <div>
                      <span className="text-[#686876]">Status</span>
                      <div className="mt-0.5">
                        <StatusBadge status={selectedDetail.status} />
                      </div>
                    </div>
                  </div>

                  {selectedDetail.proposedContent ? (
                    <div className="space-y-3 rounded-xl border border-[#e6e6ee] bg-white p-4 text-sm">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#6d4aff]">
                        Proposed report content
                      </p>
                      {selectedDetail.proposedContent.summary ? (
                        <div>
                          <p className="text-xs font-medium text-[#686876]">
                            Summary
                          </p>
                          <p className="mt-1 leading-relaxed text-[#18181f]">
                            {selectedDetail.proposedContent.summary}
                          </p>
                        </div>
                      ) : null}
                      {selectedDetail.proposedContent.dates &&
                      selectedDetail.proposedContent.dates.length > 0 ? (
                        <div>
                          <p className="text-xs font-medium text-[#686876]">
                            Dates
                          </p>
                          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-[#2e2d38]">
                            {selectedDetail.proposedContent.dates.map(
                              (dateItem, idx) => (
                                <li key={`prop-date-${idx}`}>{dateItem}</li>
                              ),
                            )}
                          </ul>
                        </div>
                      ) : null}
                      {selectedDetail.proposedContent.actionItems &&
                      selectedDetail.proposedContent.actionItems.length > 0 ? (
                        <div>
                          <p className="text-xs font-medium text-[#686876]">
                            Action items
                          </p>
                          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-[#2e2d38]">
                            {selectedDetail.proposedContent.actionItems.map(
                              (actionItem, idx) => (
                                <li key={`prop-act-${idx}`}>{actionItem}</li>
                              ),
                            )}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-xs text-[#686876]">
                      No proposed content available for this approval state.
                    </p>
                  )}

                  {selectedDetail.status === "pending" ? (
                    <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                      <Button
                        variant="outline"
                        disabled={deciding}
                        onClick={() => setConfirmRejectOpen(true)}
                        className="text-rose-600 hover:bg-rose-50"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                        Reject
                      </Button>
                      <Button
                        disabled={deciding}
                        onClick={() => void submitDecision("approved")}
                      >
                        <Check className="h-4 w-4" aria-hidden="true" />
                        {deciding ? "Recording..." : "Approve & replace"}
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={confirmRejectOpen}
        onClose={() => setConfirmRejectOpen(false)}
        onConfirm={() => void submitDecision("rejected")}
        title="Reject report replacement?"
        description="Rejecting discards the proposed report content and stops this workflow execution."
        confirmLabel="Reject replacement"
        destructive
        busy={deciding}
      />
    </div>
  );
}


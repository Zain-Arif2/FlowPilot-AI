"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApprovalListSchema,
  DocumentListSchema,
  ExecutionListSchema,
  ReportListSchema,
  WorkflowListSchema,
  type ApprovalDto,
  type DocumentDto,
  type ExecutionDto,
  type ReportDto,
  type WorkflowDto,
} from "@flowpilot/shared";
import { apiRequest, getErrorMessage } from "../lib/api.js";

export interface WorkspaceResources {
  readonly documents: readonly DocumentDto[];
  readonly workflows: readonly WorkflowDto[];
  readonly reports: readonly ReportDto[];
  readonly approvals: readonly ApprovalDto[];
  readonly executions: readonly ExecutionDto[];
  readonly loading: boolean;
  readonly error: string;
  readonly reload: () => Promise<void>;
  readonly setWorkflows: (
    updater: (current: WorkflowDto[]) => WorkflowDto[],
  ) => void;
  readonly setExecutions: (
    updater: (current: ExecutionDto[]) => ExecutionDto[],
  ) => void;
}

export function useWorkspaceResources(
  workspaceId: string | undefined,
): WorkspaceResources {
  const [documents, setDocuments] = useState<DocumentDto[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowDto[]>([]);
  const [reports, setReports] = useState<ReportDto[]>([]);
  const [approvals, setApprovals] = useState<ApprovalDto[]>([]);
  const [executions, setExecutions] = useState<ExecutionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!workspaceId) {
      setDocuments([]);
      setWorkflows([]);
      setReports([]);
      setApprovals([]);
      setExecutions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const base = `/workspaces/${encodeURIComponent(workspaceId)}`;
      const [docs, wfs, reps, apps, execs] = await Promise.all([
        apiRequest(`${base}/documents`, DocumentListSchema),
        apiRequest(`${base}/workflows`, WorkflowListSchema),
        apiRequest(`${base}/reports`, ReportListSchema),
        apiRequest(`${base}/approvals`, ApprovalListSchema),
        apiRequest(`${base}/executions`, ExecutionListSchema),
      ]);
      setDocuments(docs);
      setWorkflows(wfs);
      setReports(reps);
      setApprovals(apps);
      setExecutions(execs);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    documents,
    workflows,
    reports,
    approvals,
    executions,
    loading,
    error,
    reload,
    setWorkflows,
    setExecutions,
  };
}


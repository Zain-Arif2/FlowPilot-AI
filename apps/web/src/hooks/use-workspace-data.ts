"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  readonly refreshing: boolean;
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
  const [loadedWorkspaceId, setLoadedWorkspaceId] = useState<
    string | undefined
  >(undefined);
  const loadedWorkspaceIdRef = useRef<string | undefined>(undefined);
  const [settledWorkspaceId, setSettledWorkspaceId] = useState<
    string | undefined
  >(undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [resourceError, setResourceError] = useState<{
    readonly workspaceId: string | undefined;
    readonly message: string;
  }>({ workspaceId: undefined, message: "" });
  const requestVersion = useRef(0);

  const reload = useCallback(async () => {
    const currentRequestVersion = ++requestVersion.current;
    if (!workspaceId) {
      setDocuments([]);
      setWorkflows([]);
      setReports([]);
      setApprovals([]);
      setExecutions([]);
      loadedWorkspaceIdRef.current = undefined;
      setLoadedWorkspaceId(undefined);
      setSettledWorkspaceId(undefined);
      setRefreshing(false);
      setResourceError({ workspaceId: undefined, message: "" });
      return;
    }

    const hasCachedData = loadedWorkspaceIdRef.current === workspaceId;
    setRefreshing(hasCachedData);
    setResourceError({ workspaceId, message: "" });
    try {
      const base = `/workspaces/${encodeURIComponent(workspaceId)}`;
      const [docs, wfs, reps, apps, execs] = await Promise.all([
        apiRequest(`${base}/documents`, DocumentListSchema),
        apiRequest(`${base}/workflows`, WorkflowListSchema),
        apiRequest(`${base}/reports`, ReportListSchema),
        apiRequest(`${base}/approvals`, ApprovalListSchema),
        apiRequest(`${base}/executions`, ExecutionListSchema),
      ]);
      if (currentRequestVersion !== requestVersion.current) return;
      setDocuments(docs);
      setWorkflows(wfs);
      setReports(reps);
      setApprovals(apps);
      setExecutions(execs);
      loadedWorkspaceIdRef.current = workspaceId;
      setLoadedWorkspaceId(workspaceId);
      setSettledWorkspaceId(workspaceId);
    } catch (err) {
      if (currentRequestVersion !== requestVersion.current) return;
      setResourceError({ workspaceId, message: getErrorMessage(err) });
      setSettledWorkspaceId(workspaceId);
    } finally {
      if (currentRequestVersion === requestVersion.current) {
        setRefreshing(false);
      }
    }
  }, [workspaceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (
      !workspaceId ||
      !documents.some(
        (document) =>
          document.status === "uploading" || document.status === "validating",
      )
    ) {
      return;
    }

    let active = true;
    let timeout: ReturnType<typeof setTimeout>;
    const pollDocuments = async () => {
      try {
        const base = `/workspaces/${encodeURIComponent(workspaceId)}`;
        const current = await apiRequest(
          `${base}/documents`,
          DocumentListSchema,
        );
        if (active) setDocuments(current);
      } catch (err) {
        if (active) {
          setResourceError({ workspaceId, message: getErrorMessage(err) });
        }
      }

      if (active) {
        timeout = setTimeout(() => void pollDocuments(), 2_000);
      }
    };

    timeout = setTimeout(() => void pollDocuments(), 2_000);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [documents, workspaceId]);

  const hasActiveExecutions = executions.some(
    (execution) => execution.status === "queued" || execution.status === "running",
  );

  useEffect(() => {
    if (!workspaceId || !hasActiveExecutions) return;

    let active = true;
    let requestInFlight = false;
    const pollExecutions = async () => {
      if (requestInFlight) return;
      requestInFlight = true;
      try {
        const current = await apiRequest(
          `/workspaces/${encodeURIComponent(workspaceId)}/executions`,
          ExecutionListSchema,
        );
        if (active) setExecutions(current);
      } catch (err) {
        if (active) {
          setResourceError({ workspaceId, message: getErrorMessage(err) });
        }
      } finally {
        requestInFlight = false;
      }
    };

    void pollExecutions();
    const interval = setInterval(() => void pollExecutions(), 2_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [hasActiveExecutions, workspaceId]);

  const hasCurrentWorkspaceData =
    workspaceId !== undefined && loadedWorkspaceId === workspaceId;
  const visibleDocuments = hasCurrentWorkspaceData ? documents : [];
  const visibleWorkflows = hasCurrentWorkspaceData ? workflows : [];
  const visibleReports = hasCurrentWorkspaceData ? reports : [];
  const visibleApprovals = hasCurrentWorkspaceData ? approvals : [];
  const visibleExecutions = hasCurrentWorkspaceData ? executions : [];
  const loading =
    workspaceId !== undefined &&
    !hasCurrentWorkspaceData &&
    settledWorkspaceId !== workspaceId;
  const error =
    resourceError.workspaceId === workspaceId ? resourceError.message : "";

  return {
    documents: visibleDocuments,
    workflows: visibleWorkflows,
    reports: visibleReports,
    approvals: visibleApprovals,
    executions: visibleExecutions,
    loading,
    refreshing: hasCurrentWorkspaceData && refreshing,
    error,
    reload,
    setWorkflows: (updater) => {
      if (hasCurrentWorkspaceData) {
        setWorkflows(updater);
      }
    },
    setExecutions: (updater) => {
      if (hasCurrentWorkspaceData) {
        setExecutions(updater);
      }
    },
  };
}


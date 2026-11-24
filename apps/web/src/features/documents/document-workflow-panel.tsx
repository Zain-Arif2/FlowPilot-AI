"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ApprovalDetailSchema,
  ApprovalListSchema,
  ApprovalSchema,
  DocumentListSchema,
  DocumentSchema,
  DocumentUploadIntentSchema,
  ExecutionSchema,
  ReportListSchema,
  WorkflowListSchema,
  WorkflowProposalSchema,
  WorkflowSchema,
  type DocumentDto,
  type ApprovalDetailDto,
  type ApprovalDto,
  type ReportDto,
  type WorkflowDto,
  type Workspace,
} from "@flowpilot/shared";
import {
  ApiRequestError,
  apiRequest,
  apiRequestVoid,
  getErrorMessage,
} from "../../lib/api.js";

const MAX_UPLOAD_BYTES = 20_000_000;

function mediaTypeFor(file: File): string | null {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (file.type === "application/pdf" || extension === "pdf") {
    return "application/pdf";
  }
  if (
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    extension === "docx"
  ) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (file.type === "text/plain" || extension === "txt") return "text/plain";
  return null;
}

export function DocumentWorkflowPanel({
  workspace,
}: {
  readonly workspace: Workspace;
}) {
  const [documents, setDocuments] = useState<DocumentDto[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowDto[]>([]);
  const [reports, setReports] = useState<ReportDto[]>([]);
  const [approvals, setApprovals] = useState<ApprovalDto[]>([]);
  const [selectedApproval, setSelectedApproval] = useState<ApprovalDetailDto | null>(
    null,
  );
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState(
    "Summarize this document, identify important dates and action items, and create a report.",
  );
  const [proposalName, setProposalName] = useState("Document summary");
  const [proposal, setProposal] = useState<{
    readonly definition: WorkflowDto["definition"];
    readonly warnings: string[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const workspacePath = `/workspaces/${encodeURIComponent(workspace.id)}`;
      const [nextDocuments, nextWorkflows, nextReports, nextApprovals] =
        await Promise.all([
          apiRequest(`${workspacePath}/documents`, DocumentListSchema),
          apiRequest(`${workspacePath}/workflows`, WorkflowListSchema),
          apiRequest(`${workspacePath}/reports`, ReportListSchema),
          apiRequest(`${workspacePath}/approvals`, ApprovalListSchema),
        ]);
      setDocuments(nextDocuments);
      setWorkflows(nextWorkflows);
      setReports(nextReports);
      setApprovals(nextApprovals);
      setSelectedDocumentId((current) =>
        nextDocuments.some(
          (document) => document.id === current && document.status === "ready",
        )
          ? current
          : (nextDocuments.find((document) => document.status === "ready")?.id ?? ""),
      );
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [workspace.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile) return;
    const mediaType = mediaTypeFor(selectedFile);
    if (!mediaType) {
      setErrorMessage("Choose a PDF, DOCX, or TXT file.");
      return;
    }
    if (selectedFile.size < 1 || selectedFile.size > MAX_UPLOAD_BYTES) {
      setErrorMessage("Files must be between 1 byte and 20 MB.");
      return;
    }

    setBusy(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      const workspacePath = `/workspaces/${encodeURIComponent(workspace.id)}`;
      const intent = await apiRequest(
        `${workspacePath}/documents`,
        DocumentUploadIntentSchema,
        {
          method: "POST",
          body: {
            filename: selectedFile.name,
            mediaType,
            byteSize: selectedFile.size,
          },
        },
      );
      const uploaded = await fetch(intent.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": mediaType },
        body: selectedFile,
      });
      if (!uploaded.ok) {
        throw new Error("The private document upload could not be completed.");
      }
      await apiRequest(
        `${workspacePath}/documents/${encodeURIComponent(intent.document.id)}/complete`,
        DocumentSchema,
        { method: "POST" },
      );
      setSelectedFile(null);
      setStatusMessage("Upload received. Document validation is running.");
      await reload();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function proposeWorkflow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDocumentId) return;
    setBusy(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      const proposalResponse = await apiRequest(
        `/workspaces/${encodeURIComponent(workspace.id)}/workflow-proposals`,
        WorkflowProposalSchema,
        {
          method: "POST",
          body: { prompt, documentId: selectedDocumentId },
        },
      );
      setProposal(proposalResponse);
      setStatusMessage("Review the validated workflow before saving it.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveWorkflow() {
    if (!proposal) return;
    setBusy(true);
    setErrorMessage("");
    try {
      const saved = await apiRequest(
        `/workspaces/${encodeURIComponent(workspace.id)}/workflows`,
        WorkflowSchema,
        {
          method: "POST",
          body: { name: proposalName, definition: proposal.definition },
        },
      );
      setWorkflows((current) => [saved, ...current]);
      setProposal(null);
      setStatusMessage("Workflow saved. Select a ready document to run it.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function runWorkflow(workflow: WorkflowDto) {
    if (!selectedDocumentId) {
      setErrorMessage("Select a ready document before starting a workflow.");
      return;
    }
    setBusy(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      const execution = await apiRequest(
        `/workspaces/${encodeURIComponent(workspace.id)}/workflows/${encodeURIComponent(workflow.id)}/executions`,
        ExecutionSchema,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: {
            workflowRevision: workflow.revision,
            documentId: selectedDocumentId,
          },
        },
      );
      setStatusMessage(
        `Execution ${execution.status}. Reports will appear here when processing finishes.`,
      );
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function reviewApproval(approvalId: string) {
    setBusy(true);
    setErrorMessage("");
    try {
      const detail = await apiRequest(
        `/workspaces/${encodeURIComponent(workspace.id)}/approvals/${encodeURIComponent(approvalId)}`,
        ApprovalDetailSchema,
      );
      setSelectedApproval(detail);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function decideApproval(decision: "approved" | "rejected") {
    if (!selectedApproval) return;
    setBusy(true);
    setErrorMessage("");
    try {
      await apiRequest(
        `/workspaces/${encodeURIComponent(workspace.id)}/approvals/${encodeURIComponent(selectedApproval.id)}/decision`,
        ApprovalSchema,
        { method: "POST", body: { decision } },
      );
      setSelectedApproval(null);
      setStatusMessage(
        decision === "approved"
          ? "Approval recorded. The workflow will continue."
          : "Approval rejected. The workflow was stopped.",
      );
      await reload();
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) {
        setSelectedApproval(null);
        await reload();
        setErrorMessage(getErrorMessage(error));
      } else {
        setErrorMessage(getErrorMessage(error));
      }
    } finally {
      setBusy(false);
    }
  }

  async function deleteDocument(documentId: string) {
    setBusy(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      await apiRequestVoid(
        `/workspaces/${encodeURIComponent(workspace.id)}/documents/${encodeURIComponent(documentId)}`,
        { method: "DELETE" },
      );
      setStatusMessage("Document removal was queued.");
      await reload();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="workflow-dashboard" aria-labelledby="documents-heading">
      <header className="workflow-dashboard-header">
        <div>
          <p className="eyebrow">Private workspace</p>
          <h2 id="documents-heading">{workspace.name} documents and workflows</h2>
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={() => void reload()}
          disabled={loading || busy}
        >
          Refresh
        </button>
      </header>

      {errorMessage && (
        <p className="error-message" role="alert">
          {errorMessage}
        </p>
      )}
      {statusMessage && (
        <p className="success-message" role="status">
          {statusMessage}
        </p>
      )}
      {loading ? (
        <p className="muted" role="status">
          Loading workspace documents...
        </p>
      ) : (
        <div className="workflow-grid">
          <section className="workflow-card" aria-labelledby="upload-heading">
            <h3 id="upload-heading">Upload a document</h3>
            <p className="muted">PDF, DOCX, or TXT. Maximum file size: 20 MB.</p>
            <form className="form-stack" onSubmit={uploadDocument}>
              <label>
                Document file
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  required
                  onChange={(event) =>
                    setSelectedFile(event.currentTarget.files?.[0] ?? null)
                  }
                />
              </label>
              <button
                className="primary-button"
                type="submit"
                disabled={busy || !selectedFile}
              >
                Upload privately
              </button>
            </form>

            <h4>Documents</h4>
            {documents.length === 0 ? (
              <p className="empty-state">No documents uploaded yet.</p>
            ) : (
              <ul className="resource-list">
                {documents.map((document) => (
                  <li key={document.id}>
                    <div>
                      <strong>{document.filename}</strong>
                      <span className="resource-meta">
                        {document.status} · {Math.ceil(document.byteSize / 1024)} KB
                      </span>
                    </div>
                    <button
                      className="text-button"
                      type="button"
                      disabled={busy || document.status === "deleting"}
                      onClick={() => void deleteDocument(document.id)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="workflow-card" aria-labelledby="proposal-heading">
            <h3 id="proposal-heading">Describe a workflow</h3>
            <form className="form-stack" onSubmit={proposeWorkflow}>
              <label>
                Ready document
                <select
                  required
                  value={selectedDocumentId}
                  onChange={(event) => setSelectedDocumentId(event.currentTarget.value)}
                >
                  <option value="">Select a document</option>
                  {documents
                    .filter((document) => document.status === "ready")
                    .map((document) => (
                      <option key={document.id} value={document.id}>
                        {document.filename}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Instructions
                <textarea
                  required
                  maxLength={10_000}
                  rows={4}
                  value={prompt}
                  onChange={(event) => setPrompt(event.currentTarget.value)}
                />
              </label>
              <button
                className="primary-button"
                type="submit"
                disabled={busy || !selectedDocumentId}
              >
                Generate workflow proposal
              </button>
            </form>

            {proposal && (
              <div className="proposal-review">
                <h4>Review the proposed steps</h4>
                {proposal.warnings.length > 0 && (
                  <ul className="warning-list">
                    {proposal.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                )}
                <ol className="step-list">
                  {proposal.definition.nodes.map((node) => (
                    <li key={node.id}>
                      <strong>{node.kind.replaceAll("_", " ")}</strong>
                      {node.kind === "create_report" && (
                        <span> · {node.config.title}</span>
                      )}
                      {node.kind === "condition" && (
                        <span> · {node.config.field.replaceAll("_", " ")}</span>
                      )}
                    </li>
                  ))}
                </ol>
                <label>
                  Workflow name
                  <input
                    required
                    maxLength={120}
                    value={proposalName}
                    onChange={(event) => setProposalName(event.currentTarget.value)}
                  />
                </label>
                <details>
                  <summary>Inspect structured workflow</summary>
                  <pre>{JSON.stringify(proposal.definition, null, 2)}</pre>
                </details>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={busy}
                  onClick={() => setProposal(null)}
                >
                  Discard proposal
                </button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={busy || proposalName.trim().length === 0}
                  onClick={() => void saveWorkflow()}
                >
                  Save approved steps
                </button>
              </div>
            )}
          </section>

          <section className="workflow-card" aria-labelledby="saved-workflows-heading">
            <h3 id="saved-workflows-heading">Saved workflows</h3>
            {workflows.length === 0 ? (
              <p className="empty-state">Generate and save a workflow to begin.</p>
            ) : (
              <ul className="resource-list">
                {workflows.map((workflow) => (
                  <li key={workflow.id}>
                    <div>
                      <strong>{workflow.name}</strong>
                      <span className="resource-meta">
                        Revision {workflow.revision} ·{" "}
                        {workflow.definition.nodes.length} steps
                      </span>
                    </div>
                    <button
                      className="primary-button compact-button"
                      type="button"
                      disabled={busy || !selectedDocumentId}
                      onClick={() => void runWorkflow(workflow)}
                    >
                      Run
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="workflow-card" aria-labelledby="reports-heading">
            <h3 id="reports-heading">Reports</h3>
            {reports.length === 0 ? (
              <p className="empty-state">
                Completed workflow reports will appear here.
              </p>
            ) : (
              <ul className="report-list">
                {reports.map((report) => (
                  <li key={report.id}>
                    <h4>{report.title}</h4>
                    <p>{report.content.summary ?? "No summary was requested."}</p>
                    {report.content.dates && report.content.dates.length > 0 && (
                      <div>
                        <strong>Important dates</strong>
                        <ul>
                          {report.content.dates.map((date, index) => (
                            <li key={`${report.id}-date-${index}`}>{date}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {report.content.actionItems &&
                      report.content.actionItems.length > 0 && (
                        <div>
                          <strong>Action items</strong>
                          <ul>
                            {report.content.actionItems.map((item, index) => (
                              <li key={`${report.id}-action-${index}`}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="workflow-card" aria-labelledby="approvals-heading">
            <h3 id="approvals-heading">Approvals</h3>
            {approvals.length === 0 ? (
              <p className="empty-state">
                Sensitive workflow actions will request approval here.
              </p>
            ) : (
              <ul className="resource-list">
                {approvals.map((approval) => (
                  <li key={approval.id}>
                    <div>
                      <strong>{approval.actionType.replaceAll("_", " ")}</strong>
                      <span className="resource-meta">
                        Report revision {approval.expectedReportRevision} ·{" "}
                        {approval.status}
                      </span>
                    </div>
                    <button
                      className="secondary-button compact-button"
                      type="button"
                      disabled={busy}
                      onClick={() => void reviewApproval(approval.id)}
                    >
                      Review
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {selectedApproval && (
              <div className="proposal-review">
                <h4>Approval details</h4>
                <p className="resource-meta">
                  Workspace {selectedApproval.workspaceId} · report{" "}
                  {selectedApproval.targetReportId} · expected revision{" "}
                  {selectedApproval.expectedReportRevision}
                </p>
                {selectedApproval.proposedContent ? (
                  <div className="approval-content">
                    <strong>Proposed report content</strong>
                    <p>{selectedApproval.proposedContent.summary ?? "No summary."}</p>
                    {selectedApproval.proposedContent.dates?.map((date, index) => (
                      <p key={`approval-date-${index}`}>Date: {date}</p>
                    ))}
                    {selectedApproval.proposedContent.actionItems?.map(
                      (item, index) => (
                        <p key={`approval-action-${index}`}>Action: {item}</p>
                      ),
                    )}
                  </div>
                ) : (
                  <p className="muted">This approval is no longer pending.</p>
                )}
                <div className="approval-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={busy}
                    onClick={() => setSelectedApproval(null)}
                  >
                    Close
                  </button>
                  {selectedApproval.status === "pending" &&
                    selectedApproval.proposedContent !== null && (
                      <>
                        <button
                          className="secondary-button"
                          type="button"
                          disabled={busy}
                          onClick={() => void decideApproval("rejected")}
                        >
                          Reject
                        </button>
                        <button
                          className="primary-button"
                          type="button"
                          disabled={busy}
                          onClick={() => void decideApproval("approved")}
                        >
                          Approve
                        </button>
                      </>
                    )}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

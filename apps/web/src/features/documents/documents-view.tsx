"use client";

import { useRef, useState, type DragEvent, type FormEvent } from "react";
import {
  DocumentSchema,
  DocumentUploadIntentSchema,
  DOCUMENT_MAX_BYTES,
  ReportSchema,
  type DocumentDto,
  type ReportDto,
  type Workspace,
} from "@flowpilot/shared";
import {
  Calendar,
  CheckSquare,
  Download,
  FileText,
  FileUp,
  FolderOpen,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { apiRequest, apiRequestVoid, getErrorMessage } from "../../lib/api.js";
import { formatBytes, formatRelativeDate } from "../../lib/utils.js";
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
import {
  createReportPdf,
  createReportText,
  reportFilename,
} from "./report-download.js";

const MAX_UPLOAD_BYTES = DOCUMENT_MAX_BYTES;

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
  if (file.type === "text/plain" || extension === "txt") {
    return "text/plain";
  }
  return null;
}

interface DocumentsViewProps {
  readonly workspace: Workspace;
  readonly documents: readonly DocumentDto[];
  readonly reports: readonly ReportDto[];
  readonly loading: boolean;
  readonly onReload: () => Promise<void>;
}

export function DocumentsView({
  workspace,
  documents,
  reports,
  loading,
  onReload,
}: DocumentsViewProps) {
  const { notify } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState<DocumentDto | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [downloadingReportId, setDownloadingReportId] = useState<string | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<"documents" | "reports">(
    "documents",
  );

  function pickFile(file: File | null) {
    if (!file) {
      setSelectedFile(null);
      return;
    }
    const mediaType = mediaTypeFor(file);
    if (!mediaType) {
      notify({
        tone: "error",
        title: "Unsupported file format",
        description: "Please choose a PDF, DOCX, or TXT file.",
      });
      return;
    }
    if (file.size < 1) {
      notify({
        tone: "error",
        title: "File is empty",
        description: "Choose a file that contains at least 1 byte.",
      });
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      notify({
        tone: "error",
        title: "File too large",
        description: "This file exceeds the 4 MB upload limit. Choose a smaller file.",
      });
      return;
    }
    setSelectedFile(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0] ?? null;
    pickFile(file);
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile) return;
    const mediaType = mediaTypeFor(selectedFile);
    if (!mediaType) return;

    setUploading(true);
    try {
      const base = `/workspaces/${encodeURIComponent(workspace.id)}`;
      const intent = await apiRequest(
        `${base}/documents`,
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
        `${base}/documents/${encodeURIComponent(intent.document.id)}/complete`,
        DocumentSchema,
        { method: "POST" },
      );
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      notify({
        tone: "success",
        title: "Document uploaded",
        description: "Validation is running. It will be ready shortly.",
      });
      await onReload();
    } catch (error) {
      notify({
        tone: "error",
        title: "Upload failed",
        description: getErrorMessage(error),
      });
    } finally {
      setUploading(false);
    }
  }

  async function confirmDelete() {
    if (!deletingDoc) return;
    setDeletingBusy(true);
    try {
      await apiRequestVoid(
        `/workspaces/${encodeURIComponent(workspace.id)}/documents/${encodeURIComponent(deletingDoc.id)}`,
        { method: "DELETE" },
      );
      notify({
        tone: "success",
        title: "Document removal queued",
        description: `${deletingDoc.filename} and its derived content are being removed.`,
      });
      setDeletingDoc(null);
      await onReload();
    } catch (error) {
      notify({
        tone: "error",
        title: "Could not remove document",
        description: getErrorMessage(error),
      });
    } finally {
      setDeletingBusy(false);
    }
  }

  async function downloadReport(reportId: string, format: "pdf" | "txt") {
    setDownloadingReportId(reportId);
    try {
      const report = await apiRequest(
        `/workspaces/${encodeURIComponent(workspace.id)}/reports/${encodeURIComponent(reportId)}`,
        ReportSchema,
      );
      const blob =
        format === "pdf"
          ? new Blob([createReportPdf(report)], { type: "application/pdf" })
          : new Blob([createReportText(report)], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = reportFilename(report.title, format);
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      notify({
        tone: "success",
        title: "Report downloaded",
        description: `Your ${format.toUpperCase()} report is ready.`,
      });
    } catch (error) {
      notify({
        tone: "error",
        title: "Report download failed",
        description: getErrorMessage(error),
      });
    } finally {
      setDownloadingReportId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Upload Card */}
      <Card>
        <CardHeader className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <CardTitle>Upload document</CardTitle>
            <CardDescription>
              Portfolio demo only: do not upload real, confidential, or sensitive
              documents. Use synthetic sample files only. PDF, DOCX, or TXT up to 4 MB.
            </CardDescription>
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
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpload} className="space-y-4">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors ${
                dragging
                  ? "border-[#6d4aff] bg-[#f2effc]/60"
                  : "border-[#dcdbe6] bg-[#fafafe] hover:border-[#b8b5cc]"
              }`}
            >
              <div className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl bg-[#f2effc] text-[#6d4aff]">
                <FileUp className="h-5 w-5" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium text-[#18181f]">
                {selectedFile
                  ? selectedFile.name
                  : "Drag and drop a file here, or browse"}
              </p>
              <p className="mt-1 text-xs text-[#686876]">
                {selectedFile
                  ? `${formatBytes(selectedFile.size)} selected`
                  : "Supports PDF (up to 100 pages), DOCX, and UTF-8 TXT"}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                className="sr-only"
                id="document-upload-input"
                onChange={(event) =>
                  pickFile(event.currentTarget.files?.[0] ?? null)
                }
              />
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose file
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!selectedFile || uploading}
                >
                  <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
                  {uploading ? "Uploading..." : "Upload privately"}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Tabs: Documents & Reports */}
      <div className="flex items-center gap-2 border-b border-[#e6e6ee]">
        <button
          type="button"
          onClick={() => setActiveTab("documents")}
          className={`border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "documents"
              ? "border-[#6d4aff] text-[#6d4aff]"
              : "border-transparent text-[#686876] hover:text-[#18181f]"
          }`}
        >
          Documents ({documents.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("reports")}
          className={`border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "reports"
              ? "border-[#6d4aff] text-[#6d4aff]"
              : "border-transparent text-[#686876] hover:text-[#18181f]"
          }`}
        >
          Generated Reports ({reports.length})
        </button>
      </div>

      {activeTab === "documents" ? (
        loading ? (
          <div className="space-y-3" role="status" aria-label="Loading documents">
            {Array.from({ length: 4 }, (_, idx) => (
              <Skeleton key={`doc-skel-${idx}`} className="h-16 w-full" />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="No documents in this workspace"
            description="Upload a PDF, DOCX, or TXT file above to extract text and run AI workflows."
          />
        ) : (
          <Card>
            {/* Desktop Table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#efeff4] text-xs font-medium text-[#686876]">
                    <th className="px-5 py-3.5">Filename</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5">Size</th>
                    <th className="px-4 py-3.5">Uploaded</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#efeff4]">
                  {documents.map((doc) => (
                    <tr
                      key={doc.id}
                      className="transition-colors hover:bg-[#fafafe]"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <FileText
                            className="h-4 w-4 shrink-0 text-[#6d4aff]"
                            aria-hidden="true"
                          />
                          <span className="font-medium text-[#18181f]">
                            {doc.filename}
                          </span>
                        </div>
                        {doc.failureCode ? (
                          <p className="mt-0.5 pl-6 text-xs text-rose-600">
                            Error: {doc.failureCode}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={doc.status} />
                      </td>
                      <td className="px-4 py-3.5 text-[#686876]">
                        {formatBytes(doc.byteSize)}
                      </td>
                      <td className="px-4 py-3.5 text-[#686876]">
                        {formatRelativeDate(doc.createdAt)}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={doc.status === "deleting"}
                          onClick={() => setDeletingDoc(doc)}
                          className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <ul className="divide-y divide-[#efeff4] md:hidden">
              {documents.map((doc) => (
                <li key={doc.id} className="space-y-2.5 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#18181f]">
                        {doc.filename}
                      </p>
                      <p className="text-xs text-[#686876]">
                        {formatBytes(doc.byteSize)} ·{" "}
                        {formatRelativeDate(doc.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={doc.status} />
                  </div>
                  {doc.failureCode ? (
                    <p className="text-xs text-rose-600">
                      Error: {doc.failureCode}
                    </p>
                  ) : null}
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={doc.status === "deleting"}
                      onClick={() => setDeletingDoc(doc)}
                      className="text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )
      ) : loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }, (_, idx) => (
            <Skeleton key={`rep-skel-${idx}`} className="h-44 w-full" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No reports generated yet"
          description="Run a workflow that includes a Create Report step to see structured summaries, dates, and action items here."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {reports.map((report) => (
            <Card key={report.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{report.title}</CardTitle>
                  <Badge variant="purple">Rev {report.revision}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {report.content.summary ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#686876]">
                      Summary
                    </p>
                    <p className="mt-1 leading-relaxed text-[#2e2d38]">
                      {report.content.summary}
                    </p>
                  </div>
                ) : null}
                {report.content.dates && report.content.dates.length > 0 ? (
                  <div>
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#686876]">
                      <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                      Key dates
                    </p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-[#3f3e4d]">
                      {report.content.dates.map((item, idx) => (
                        <li key={`${report.id}-date-${idx}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {report.content.actionItems &&
                report.content.actionItems.length > 0 ? (
                  <div>
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#686876]">
                      <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" />
                      Action items
                    </p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-[#3f3e4d]">
                      {report.content.actionItems.map((item, idx) => (
                        <li key={`${report.id}-action-${idx}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="flex flex-wrap justify-end gap-2 border-t border-[#efeff4] pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={downloadingReportId !== null}
                    onClick={() => void downloadReport(report.id, "txt")}
                  >
                    {downloadingReportId === report.id ? (
                      <RefreshCw
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Download TXT
                  </Button>
                  <Button
                    size="sm"
                    disabled={downloadingReportId !== null}
                    onClick={() => void downloadReport(report.id, "pdf")}
                  >
                    {downloadingReportId === report.id ? (
                      <RefreshCw
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Download PDF
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deletingDoc !== null}
        onClose={() => setDeletingDoc(null)}
        onConfirm={() => void confirmDelete()}
        title="Remove document?"
        description={
          deletingDoc
            ? `This will permanently delete "${deletingDoc.filename}", its extracted text, and any linked reports.`
            : ""
        }
        confirmLabel="Remove document"
        destructive
        busy={deletingBusy}
      />
    </div>
  );
}

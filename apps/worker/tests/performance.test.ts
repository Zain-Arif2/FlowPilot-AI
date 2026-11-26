import { describe, expect, it } from "vitest";
import type { WorkflowDefinition } from "@flowpilot/shared";
import type { StructuredRequest } from "@flowpilot/shared/ai/openrouter";
import { extractDocument } from "../src/processors/document.processor.js";
import { createWorkflowExecutionProcessor } from "../src/processors/workflow.processor.js";
import type { DocumentAnalysisClient } from "../src/tools/analyze-document.js";
import type { ReportRepository } from "@flowpilot/db/repositories";

function createPdf(pageCount: number): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${Array.from(
      { length: pageCount },
      (_value, index) => `${4 + index * 2} 0 R`,
    ).join(" ")}] /Count ${pageCount} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  for (let index = 0; index < pageCount; index += 1) {
    const pageId = 4 + index * 2;
    const stream = `BT /F1 12 Tf 72 720 Td (Page ${index + 1} text) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId + 1} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    );
  }

  let source = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(source));
    source += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(source);
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    source += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(source);
}

function uuid(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

describe("synthetic document performance boundary", () => {
  it(
    "extracts a 20 MB PDF with 100 native pages within the three-minute budget",
    async () => {
      const source = createPdf(100);
      const bytes = Buffer.concat([
        source,
        Buffer.alloc(20_000_000 - source.length, 0x20),
      ]);
      const startedAt = performance.now();

      const result = await extractDocument("pdf", bytes, bytes.length);

      expect(bytes.byteLength).toBe(20_000_000);
      expect(result.pageCount).toBe(100);
      expect(result.text).toContain("Page 100 text");
      expect(performance.now() - startedAt).toBeLessThan(180_000);
    },
    180_000,
  );

  it(
    "extracts and generates a report for a 20 MB, 100-page PDF within three minutes",
    async () => {
      const source = createPdf(100);
      const bytes = Buffer.concat([
        source,
        Buffer.alloc(20_000_000 - source.length, 0x20),
      ]);
      const userId = uuid(1);
      const workspaceId = uuid(2);
      const documentId = uuid(3);
      const executionId = uuid(4);
      const reportId = uuid(5);
      const definition: WorkflowDefinition = {
        version: 1,
        nodes: [
          { id: "extract", kind: "extract_document", position: { x: 0, y: 0 }, config: {} },
          {
            id: "analyze",
            kind: "analyze_document",
            position: { x: 0, y: 100 },
            config: { sections: ["summary", "dates", "action_items"] },
          },
          {
            id: "report",
            kind: "create_report",
            position: { x: 0, y: 200 },
            config: { title: "Synthetic report" },
          },
        ],
        edges: [
          { id: "extract-analyze", source: "extract", target: "analyze" },
          { id: "analyze-report", source: "analyze", target: "report" },
        ],
      };
      const steps = definition.nodes.map((node, index) => ({
        id: uuid(index + 10),
        nodeId: node.id,
        status: "pending" as
          | "pending"
          | "running"
          | "succeeded"
          | "failed"
          | "waiting_approval"
          | "skipped",
        artifact: null as { publicId: string } | null,
      }));
      const objects = new Map<string, Uint8Array>();
      const extracted = await extractDocument("pdf", bytes, bytes.length);
      objects.set("validated-text", new TextEncoder().encode(extracted.text));
      const reportContent = {
        summary: "Synthetic 100-page report.",
        dates: ["2026-12-01"],
        actionItems: ["Review page 100."],
      };
      const analysisClient: DocumentAnalysisClient = {
        async requestStructuredOutput<T>(request: StructuredRequest<T>): Promise<T> {
          return request.validator.parse(reportContent);
        },
      };
      const savedReports: Array<unknown> = [];
      let executionStatus:
        | "queued"
        | "running"
        | "succeeded"
        | "failed"
        | "cancelled" = "queued";
      const processor = createWorkflowExecutionProcessor({
        executions: {
          async startForWorker() {
            executionStatus = "running";
            return true;
          },
          async findForWorker() {
            return {
              id: executionId,
              status: executionStatus,
              documentId,
              workflowSnapshot: definition,
              steps: steps.map((step) => ({ ...step })),
            };
          },
          async beginStepAttempt(_context, input) {
            const step = steps.find((candidate) => candidate.id === input.executionStepId);
            if (!step || step.status === "succeeded") return null;
            step.status = "running";
            return { attemptId: uuid(30), attemptNumber: 1 };
          },
          async completeStepAttempt(_context, input) {
            const step = steps.find((candidate) => candidate.id === input.executionStepId);
            if (!step) return false;
            step.status = "succeeded";
            step.artifact = { publicId: input.asset.publicId };
            return true;
          },
          async createReportReplacementApproval() {
            return null;
          },
          async failStepAttempt() {},
          async finish(_context, input) {
            executionStatus = input.status;
            return true;
          },
        },
        documents: {
          async findById() {
            return { id: documentId, status: "ready", textPublicId: "validated-text" };
          },
        },
        reports: {
          async create(
            _context: Parameters<ReportRepository["create"]>[0],
            input: Parameters<ReportRepository["create"]>[1],
          ) {
            savedReports.push(input.content);
            return { id: reportId, content: input.content };
          },
        },
        workspaces: {
          async isOwner() {
            return true;
          },
        },
        storage: {
          async readObject(key) {
            const object = objects.get(key);
            if (!object) throw new Error("Synthetic object was not found.");
            return object;
          },
          async putObject(input) {
            objects.set(input.key, input.body);
          },
          async deleteObject(key) {
            objects.delete(key);
          },
        },
        analysisClient,
      });
      const startedAt = performance.now();

      await processor({ userId, workspaceId, executionId });

      expect(bytes.byteLength).toBe(20_000_000);
      expect(extracted.pageCount).toBe(100);
      expect(executionStatus).toBe("succeeded");
      expect(savedReports).toEqual([reportContent]);
      expect(performance.now() - startedAt).toBeLessThan(180_000);
    },
    180_000,
  );
});

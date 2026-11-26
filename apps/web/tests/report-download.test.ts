import { describe, expect, it } from "vitest";
import type { ReportDto } from "@flowpilot/shared";
import {
  createReportPdf,
  createReportText,
  reportFilename,
} from "../src/features/documents/report-download.js";

const report: ReportDto = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Quarterly review",
  revision: 2,
  createdAt: "2026-01-15T12:30:00.000Z",
  content: {
    summary: "Performance improved this quarter.",
    dates: ["2026-02-01: planning review"],
    actionItems: ["Share the revised forecast."],
  },
};

describe("generated report downloads", () => {
  it("creates readable text with the report title, content, and created date", () => {
    const text = createReportText(report);

    expect(text).toContain("Quarterly review");
    expect(text).toContain("Created: January 15, 2026");
    expect(text).toContain("Performance improved this quarter.");
    expect(text).toContain("- 2026-02-01: planning review");
    expect(text).toContain("- Share the revised forecast.");
  });

  it("generates a multi-section PDF containing every requested report field", () => {
    const pdf = new TextDecoder().decode(new Uint8Array(createReportPdf(report)));

    expect(pdf).toContain("%PDF-");
    expect(pdf).toContain("Quarterly review");
    expect(pdf).toContain("Created: January 15, 2026");
    expect(pdf).toContain("Performance improved this quarter.");
    expect(pdf).toContain("2026-02-01: planning review");
    expect(pdf).toContain("Share the revised forecast.");
  });

  it("includes clear empty sections and sanitizes download filenames", () => {
    const emptyReport: ReportDto = {
      ...report,
      title: "Research / brief",
      content: {},
    };

    expect(createReportText(emptyReport)).toContain("No dates identified.");
    expect(createReportText(emptyReport)).toContain("No action items identified.");
    expect(reportFilename(emptyReport.title, "pdf")).toBe("Research-brief.pdf");
  });
});

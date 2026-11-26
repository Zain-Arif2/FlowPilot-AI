import { jsPDF } from "jspdf/dist/jspdf.es.min.js";
import type { ReportDto } from "@flowpilot/shared";

function createdDate(report: ReportDto): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(report.createdAt));
}

function reportSections(report: ReportDto): Array<[string, string[]]> {
  return [
    ["Summary", [report.content.summary || "No summary included."]],
    [
      "Important dates",
      report.content.dates?.length ? report.content.dates : ["No dates identified."],
    ],
    [
      "Action items",
      report.content.actionItems?.length
        ? report.content.actionItems
        : ["No action items identified."],
    ],
  ];
}

export function createReportText(report: ReportDto): string {
  const sections = reportSections(report);
  return [
    report.title,
    `Created: ${createdDate(report)}`,
    "",
    ...sections.flatMap(([heading, items]) => [
      heading,
      ...items.map((item) => (heading === "Summary" ? item : `- ${item}`)),
      "",
    ]),
  ].join("\n");
}

export function createReportPdf(report: ReportDto): ArrayBuffer {
  const pdf = new jsPDF({ unit: "pt", format: "letter", compress: false });
  const margin = 56;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const textWidth = pageWidth - margin * 2;
  let y = margin;

  const writeLines = (
    text: string,
    options: { readonly fontSize: number; readonly lineHeight: number },
  ) => {
    pdf.setFontSize(options.fontSize);
    const lines = pdf.splitTextToSize(text, textWidth) as string[];
    for (const line of lines) {
      if (y + options.lineHeight > pageHeight - margin) {
        pdf.addPage();
        y = margin;
      }
      pdf.text(line, margin, y);
      y += options.lineHeight;
    }
  };

  pdf.setProperties({ title: report.title, subject: "FlowPilot AI report" });
  pdf.setFont("helvetica", "bold");
  writeLines(report.title, { fontSize: 22, lineHeight: 28 });
  y += 5;

  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(105, 103, 116);
  writeLines(`Created: ${createdDate(report)}`, {
    fontSize: 10,
    lineHeight: 16,
  });
  y += 22;

  for (const [heading, items] of reportSections(report)) {
    if (y + 28 > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(60, 55, 76);
    writeLines(heading, { fontSize: 12, lineHeight: 18 });
    y += 2;

    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(45, 44, 54);
    for (const item of items) {
      writeLines(heading === "Summary" ? item : `- ${item}`, {
        fontSize: 11,
        lineHeight: 16,
      });
    }
    y += 18;
  }

  return pdf.output("arraybuffer");
}

export function reportFilename(title: string, extension: "pdf" | "txt"): string {
  const safeTitle =
    title
      .normalize("NFKD")
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "flowpilot-report";
  return `${safeTitle}.${extension}`;
}

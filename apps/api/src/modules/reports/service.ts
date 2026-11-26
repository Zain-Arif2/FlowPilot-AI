import type { ReportRepository } from "@flowpilot/db/repositories";
import { ReportSchema, type ReportDto } from "@flowpilot/shared";
import type { ReportService } from "../../services/contracts.js";

function toReportDto(report: {
  id: string;
  title: string;
  revision: number;
  content: unknown;
  createdAt: Date;
}): ReportDto {
  return ReportSchema.parse({
    id: report.id,
    title: report.title,
    revision: report.revision,
    content: report.content,
    createdAt: report.createdAt.toISOString(),
  });
}

export function createReportService(repository: ReportRepository): ReportService {
  return {
    async list(userId, workspaceId) {
      const reports = await repository.list({ userId, workspaceId });
      return reports.map(toReportDto);
    },

    async get(userId, workspaceId, reportId) {
      const report = await repository.findById({ userId, workspaceId }, reportId);
      return report ? toReportDto(report) : null;
    },
  };
}

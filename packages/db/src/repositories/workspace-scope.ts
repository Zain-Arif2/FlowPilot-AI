import type { Prisma, PrismaClient } from "@prisma/client";

type TenantReader = Prisma.TransactionClient | PrismaClient;

export function workspaceRecordKey(workspaceId: string, id: string) {
  return { workspaceId_id: { workspaceId, id } } as const;
}

export async function assertDocumentInWorkspace(
  reader: TenantReader,
  workspaceId: string,
  documentId: string,
): Promise<boolean> {
  const document = await reader.document.findUnique({
    where: workspaceRecordKey(workspaceId, documentId),
    select: { id: true },
  });
  return document !== null;
}

export async function assertWorkflowInWorkspace(
  reader: TenantReader,
  workspaceId: string,
  workflowId: string,
): Promise<boolean> {
  const workflow = await reader.workflow.findUnique({
    where: workspaceRecordKey(workspaceId, workflowId),
    select: { id: true },
  });
  return workflow !== null;
}

export async function assertReportInWorkspace(
  reader: TenantReader,
  workspaceId: string,
  reportId: string,
): Promise<boolean> {
  const report = await reader.report.findUnique({
    where: workspaceRecordKey(workspaceId, reportId),
    select: { id: true },
  });
  return report !== null;
}

import {
  ApprovalDecisionError,
  type ApprovalRepository,
} from "@flowpilot/db/repositories";
import {
  ApprovalDetailSchema,
  ApprovalSchema,
  ApprovalStatusSchema,
  ReportContentSchema,
  type ApprovalDecisionRequest,
  type ApprovalDetailDto,
  type ApprovalDto,
} from "@flowpilot/shared";
import { HttpError } from "../../errors/api-error.js";
import type { ApprovalService } from "../../services/contracts.js";

function toApprovalDto(approval: {
  id: string;
  workspaceId: string;
  executionId: string;
  actionType: string;
  targetReportId: string;
  expectedReportRevision: number;
  status: string;
  requestedAt: Date;
  decidedAt: Date | null;
}): ApprovalDto {
  return ApprovalSchema.parse({
    id: approval.id,
    workspaceId: approval.workspaceId,
    executionId: approval.executionId,
    actionType: approval.actionType,
    targetReportId: approval.targetReportId,
    expectedReportRevision: approval.expectedReportRevision,
    status: approval.status,
    requestedAt: approval.requestedAt.toISOString(),
    ...(approval.decidedAt ? { decidedAt: approval.decidedAt.toISOString() } : {}),
  });
}

export function createApprovalService(repository: ApprovalRepository): ApprovalService {
  return {
    async list(userId, workspaceId, status) {
      const parsedStatus =
        status === undefined ? undefined : ApprovalStatusSchema.safeParse(status);
      if (parsedStatus && !parsedStatus.success) {
        throw new HttpError(422, "INVALID_INPUT", "Approval status is invalid.");
      }
      const approvals = await repository.list(
        { userId, workspaceId },
        parsedStatus?.data,
      );
      return approvals.map(toApprovalDto);
    },

    async get(userId, workspaceId, approvalId): Promise<ApprovalDetailDto | null> {
      const approval = await repository.findById({ userId, workspaceId }, approvalId);
      if (!approval) return null;
      const proposedContent =
        approval.status === "pending" ? approval.pendingReport?.proposedContent : null;
      if (approval.status === "pending" && !approval.pendingReport) {
        throw new Error("Pending approval content is missing.");
      }
      return ApprovalDetailSchema.parse({
        ...toApprovalDto(approval),
        proposedContent:
          proposedContent === null || proposedContent === undefined
            ? null
            : ReportContentSchema.parse(proposedContent),
      });
    },

    async decide(userId, workspaceId, approvalId, input: ApprovalDecisionRequest) {
      try {
        const result = await repository.decide(
          { userId, workspaceId },
          { approvalId, decision: input.decision },
        );
        if (result.kind === "stale") {
          throw new HttpError(
            409,
            "CONFLICT",
            "The report changed after approval was requested; the approval was cancelled.",
          );
        }
        return toApprovalDto(result.approval);
      } catch (error) {
        if (error instanceof ApprovalDecisionError) {
          if (error.reason === "NOT_FOUND") {
            throw new HttpError(404, "NOT_FOUND", "Approval was not found.");
          }
          throw new HttpError(409, "CONFLICT", "The approval is no longer pending.");
        }
        throw error;
      }
    },
  };
}

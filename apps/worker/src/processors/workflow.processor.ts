import {
  ReportContentSchema,
  WorkflowDefinitionSchema,
  ConditionEvaluationError,
  evaluateCondition,
  validateWorkflowGraph,
  type ConditionValues,
  type ReportContent,
  type WorkflowDefinition,
  type WorkflowNode,
} from "@flowpilot/shared";
import type { ReportRepository, WorkspaceRepository } from "@flowpilot/db/repositories";
import { ExecutionApprovalError } from "@flowpilot/db/repositories";
import {
  createExecutionArtifactKey,
  type ReturnTypeOfWorkerStorage,
} from "../adapters/object-storage.js";
import { OpenRouterError } from "@flowpilot/shared/ai/openrouter";
import { createToolRegistry } from "../tools/registry.js";
import {
  createDocumentAnalyzer,
  type AnalysisSection,
  type DocumentAnalysisClient,
} from "../tools/analyze-document.js";
import { getNextExecutableNode } from "../workflow/runner.js";
import { InvalidWorkflowExecutionError } from "../workflow/runner.js";
import { getRetryDecision, MAX_AUTOMATIC_ATTEMPTS } from "../workflow/retry.js";
import { workerLogger } from "../logger.js";
import { z } from "zod";

const StepOutputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("extraction"), documentId: z.string().uuid() }).strict(),
  z.object({ kind: z.literal("analysis"), content: ReportContentSchema }).strict(),
  z
    .object({
      kind: z.literal("report"),
      reportId: z.string().uuid(),
      content: ReportContentSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("condition"),
      values: z
        .object({
          hasActionItems: z.boolean(),
          dateCount: z.number().int().nonnegative(),
        })
        .strict(),
      result: z.boolean(),
    })
    .strict(),
]);

type StepOutput = z.infer<typeof StepOutputSchema>;
type Tenant = { readonly userId: string; readonly workspaceId: string };

interface WorkerStep {
  readonly id: string;
  readonly nodeId: string;
  readonly status: string;
  readonly artifact: { readonly publicId: string } | null;
}

interface WorkerExecution {
  readonly id: string;
  readonly status: string;
  readonly documentId: string | null;
  readonly workflowSnapshot: unknown;
  readonly steps: ReadonlyArray<WorkerStep>;
}

interface ExecutionWorkerRepository {
  startForWorker(context: Tenant, executionId: string): Promise<boolean>;
  findForWorker(context: Tenant, executionId: string): Promise<WorkerExecution | null>;
  beginStepAttempt(
    context: Tenant,
    input: { readonly executionId: string; readonly executionStepId: string },
  ): Promise<{ readonly attemptId: string; readonly attemptNumber: number } | null>;
  completeStepAttempt(
    context: Tenant,
    input: {
      readonly executionId: string;
      readonly executionStepId: string;
      readonly attemptId: string;
      readonly sourceDocumentId: string;
      readonly asset: {
        readonly publicId: string;
        readonly resourceType: string;
        readonly deliveryType: string;
        readonly format: string;
      };
      readonly elapsedMs: number;
    },
  ): Promise<boolean>;
  createReportReplacementApproval(
    context: Tenant,
    input: {
      readonly executionId: string;
      readonly executionStepId: string;
      readonly attemptId: string;
      readonly targetReportId: string;
      readonly sourceDocumentId: string;
      readonly proposedContent: Parameters<ReportRepository["create"]>[1]["content"];
      readonly asset: {
        readonly publicId: string;
        readonly resourceType: string;
        readonly deliveryType: string;
        readonly format: string;
      };
    },
  ): Promise<unknown | null>;
  failStepAttempt(
    context: Tenant,
    input: {
      readonly executionId: string;
      readonly executionStepId: string;
      readonly attemptId: string;
      readonly attemptNumber: number;
      readonly errorCode: string;
    },
  ): Promise<void>;
  finish(
    context: Tenant,
    input: {
      readonly executionId: string;
      readonly status: "succeeded" | "failed" | "cancelled";
      readonly errorCode?: string;
    },
  ): Promise<boolean>;
}

interface WorkerDocument {
  readonly id: string;
  readonly status: string;
  readonly textPublicId: string | null;
}

interface WorkerDocuments {
  findById(context: Tenant, documentId: string): Promise<WorkerDocument | null>;
}

interface WorkerReports {
  create(
    context: Tenant,
    input: Parameters<ReportRepository["create"]>[1],
  ): Promise<{ readonly id: string; readonly content: unknown }>;
}
type WorkerWorkspaces = Pick<WorkspaceRepository, "isOwner">;
type WorkerStorage = Pick<
  ReturnTypeOfWorkerStorage,
  "readObject" | "putObject" | "deleteObject"
>;

const ReportToolOutputSchema = z
  .object({
    reportId: z.string().uuid(),
    content: ReportContentSchema,
  })
  .strict();

export class WorkflowStepError extends Error {
  constructor(
    readonly code:
      | "DOCUMENT_REQUIRED"
      | "DOCUMENT_NOT_READY"
      | "REPORT_CONTENT_MISSING"
      | "WORKFLOW_INVALID"
      | "STEP_FAILED",
  ) {
    super(code);
    this.name = "WorkflowStepError";
  }
}

function parseWorkflow(value: unknown): WorkflowDefinition {
  const parsed = WorkflowDefinitionSchema.safeParse(value);
  if (!parsed.success) throw new WorkflowStepError("WORKFLOW_INVALID");
  const validated = validateWorkflowGraph(parsed.data);
  if (!validated.success) throw new WorkflowStepError("WORKFLOW_INVALID");
  return validated.data;
}

function parseStepOutput(value: Uint8Array): StepOutput {
  let decoded: unknown;
  try {
    decoded = JSON.parse(new TextDecoder().decode(value)) as unknown;
  } catch {
    throw new WorkflowStepError("WORKFLOW_INVALID");
  }
  const parsed = StepOutputSchema.safeParse(decoded);
  if (!parsed.success) throw new WorkflowStepError("WORKFLOW_INVALID");
  return parsed.data;
}

function jsonBytes(output: StepOutput): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(StepOutputSchema.parse(output)));
}

function getAnalysisContent(outputs: ReadonlyMap<string, StepOutput>): ReportContent {
  const analyses = [...outputs.values()].filter(
    (output): output is Extract<StepOutput, { kind: "analysis" }> =>
      output.kind === "analysis",
  );
  const content = analyses.at(-1)?.content;
  if (!content) throw new WorkflowStepError("REPORT_CONTENT_MISSING");
  return content;
}

function getConditionValues(content: ReportContent): {
  readonly hasActionItems: boolean;
  readonly dateCount: number;
} {
  return {
    hasActionItems: (content.actionItems?.length ?? 0) > 0,
    dateCount: content.dates?.length ?? 0,
  };
}

function toReportJson(
  content: ReportContent,
): Parameters<ReportRepository["create"]>[1]["content"] {
  return JSON.parse(JSON.stringify(content)) as Parameters<
    ReportRepository["create"]
  >[1]["content"];
}

function failureDetails(error: unknown): {
  readonly errorCode: string;
  readonly transient: boolean;
} {
  if (error instanceof OpenRouterError) {
    return {
      errorCode: `AI_${error.code}`,
      transient: error.code === "PROVIDER_UNAVAILABLE",
    };
  }
  if (error instanceof WorkflowStepError) {
    return { errorCode: error.code, transient: false };
  }
  if (error instanceof ExecutionApprovalError) {
    return { errorCode: error.reason, transient: false };
  }
  if (typeof error === "object" && error !== null) {
    const candidate = error as {
      readonly $retryable?: unknown;
      readonly $metadata?: { readonly httpStatusCode?: unknown };
      readonly code?: unknown;
    };
    const status = candidate.$metadata?.httpStatusCode;
    const transientDatabaseCodes = new Set([
      "P1001",
      "P1002",
      "P1008",
      "P2024",
      "P2034",
    ]);
    if (
      candidate.$retryable ||
      status === 429 ||
      (typeof status === "number" && status >= 500) ||
      (typeof candidate.code === "string" && transientDatabaseCodes.has(candidate.code))
    ) {
      return { errorCode: "DEPENDENCY_UNAVAILABLE", transient: true };
    }
  }
  return { errorCode: "STEP_FAILED", transient: false };
}

function retryDelay(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function stepInput(
  node: Exclude<WorkflowNode, { kind: "condition" }>,
  documentId: string,
  outputs: ReadonlyMap<string, StepOutput>,
): unknown {
  switch (node.kind) {
    case "extract_document":
      return { documentId };
    case "analyze_document":
      return { documentId, sections: node.config.sections };
    case "create_report":
      return { title: node.config.title, content: getAnalysisContent(outputs) };
    case "replace_report":
      return {
        reportId: node.config.reportId,
        content: getAnalysisContent(outputs),
      };
  }
}

export function createWorkflowExecutionProcessor(dependencies: {
  readonly executions: ExecutionWorkerRepository;
  readonly documents: WorkerDocuments;
  readonly reports: WorkerReports;
  readonly workspaces: WorkerWorkspaces;
  readonly storage: WorkerStorage;
  readonly analysisClient: DocumentAnalysisClient;
}) {
  const analyzer = createDocumentAnalyzer(dependencies.analysisClient);

  return async (job: {
    readonly executionId: string;
    readonly workspaceId: string;
    readonly userId: string;
  }): Promise<void> => {
    const context: Tenant = {
      userId: job.userId,
      workspaceId: job.workspaceId,
    };
    if (!(await dependencies.executions.startForWorker(context, job.executionId))) {
      return;
    }

    for (let iteration = 0; iteration < 26; iteration += 1) {
      const execution = await dependencies.executions.findForWorker(
        context,
        job.executionId,
      );
      if (!execution || execution.status !== "running") return;
      let result: Awaited<ReturnType<typeof runNextStep>>;
      try {
        result = await runNextStep(execution, context);
      } catch (error) {
        if (
          error instanceof WorkflowStepError ||
          error instanceof InvalidWorkflowExecutionError ||
          error instanceof ConditionEvaluationError
        ) {
          await dependencies.executions.finish(context, {
            executionId: job.executionId,
            status: "failed",
            errorCode:
              error instanceof WorkflowStepError ? error.code : "WORKFLOW_INVALID",
          });
          return;
        }
        throw error;
      }
      if (result === "waiting_approval" || result === "stopped") return;
      if (result === "finished") {
        await dependencies.executions.finish(context, {
          executionId: job.executionId,
          status: "succeeded",
        });
        return;
      }
    }

    await dependencies.executions.finish(context, {
      executionId: job.executionId,
      status: "failed",
      errorCode: "WORKFLOW_STEP_LIMIT",
    });

    async function runNextStep(
      execution: WorkerExecution,
      tenant: Tenant,
    ): Promise<"advanced" | "waiting_approval" | "finished" | "stopped"> {
      const documentId = execution.documentId;
      if (!documentId) {
        await dependencies.executions.finish(tenant, {
          executionId: execution.id,
          status: "failed",
          errorCode: "DOCUMENT_REQUIRED",
        });
        return "stopped";
      }

      const document = await dependencies.documents.findById(tenant, documentId);
      if (!document || document.status !== "ready" || !document.textPublicId) {
        await dependencies.executions.finish(tenant, {
          executionId: execution.id,
          status: "failed",
          errorCode: "DOCUMENT_NOT_READY",
        });
        return "stopped";
      }

      const workflow = parseWorkflow(execution.workflowSnapshot);
      const outputs = new Map<string, StepOutput>();
      const completedNodeIds = new Set<string>();
      for (const step of execution.steps) {
        if (step.status !== "succeeded" && step.status !== "waiting_approval") continue;
        if (!step.artifact) {
          throw new WorkflowStepError("WORKFLOW_INVALID");
        }
        outputs.set(
          step.nodeId,
          parseStepOutput(
            await dependencies.storage.readObject(step.artifact.publicId),
          ),
        );
        if (step.status === "succeeded") completedNodeIds.add(step.nodeId);
      }

      const conditionResults = new Map<string, ConditionValues>();
      for (const node of workflow.nodes) {
        if (node.kind === "condition" && completedNodeIds.has(node.id)) {
          const output = outputs.get(node.id);
          if (output?.kind !== "condition") {
            throw new WorkflowStepError("WORKFLOW_INVALID");
          }
          conditionResults.set(node.id, output.values);
        }
      }

      const node = getNextExecutableNode(workflow, {
        completedNodeIds,
        conditionResults,
      });
      if (!node) return "finished";

      const step = execution.steps.find((candidate) => candidate.nodeId === node.id);
      if (!step) throw new WorkflowStepError("WORKFLOW_INVALID");
      const attempt = await dependencies.executions.beginStepAttempt(tenant, {
        executionId: execution.id,
        executionStepId: step.id,
      });
      if (!attempt) return "stopped";

      const publicId = createExecutionArtifactKey({
        workspaceId: tenant.workspaceId,
        sourceDocumentId: documentId,
        executionId: execution.id,
        executionStepId: step.id,
      });
      const startedAt = Date.now();
      let output: StepOutput;

      try {
        if (node.kind === "condition") {
          const values = getConditionValues(getAnalysisContent(outputs));
          output = {
            kind: "condition",
            values,
            result: evaluateCondition(node.config, values),
          };
        } else if (node.kind === "replace_report") {
          const content = getAnalysisContent(outputs);
          await dependencies.storage.putObject({
            key: publicId,
            body: jsonBytes({
              kind: "report",
              reportId: node.config.reportId,
              content,
            }),
            mediaType: "application/json",
          });
          const approval =
            await dependencies.executions.createReportReplacementApproval(tenant, {
              executionId: execution.id,
              executionStepId: step.id,
              attemptId: attempt.attemptId,
              targetReportId: node.config.reportId,
              sourceDocumentId: documentId,
              proposedContent: toReportJson(content),
              asset: {
                publicId,
                resourceType: "raw",
                deliveryType: "authenticated",
                format: "json",
              },
            });
          if (!approval) {
            await dependencies.storage.deleteObject(publicId);
            return "stopped";
          }
          workerLogger.info(
            {
              executionId: execution.id,
              workspaceId: tenant.workspaceId,
              stepId: node.id,
            },
            "Workflow is waiting for report replacement approval",
          );
          return "waiting_approval";
        } else {
          const tools = createToolRegistry(
            {
              async extract_document(input, toolContext) {
                const source = await dependencies.documents.findById(
                  { userId: toolContext.userId, workspaceId: toolContext.workspaceId },
                  input.documentId,
                );
                if (!source || source.status !== "ready") {
                  throw new WorkflowStepError("DOCUMENT_NOT_READY");
                }
                return { documentId: source.id };
              },
              async analyze_document(input, toolContext) {
                const source = await dependencies.documents.findById(
                  { userId: toolContext.userId, workspaceId: toolContext.workspaceId },
                  input.documentId,
                );
                if (!source || source.status !== "ready" || !source.textPublicId) {
                  throw new WorkflowStepError("DOCUMENT_NOT_READY");
                }
                const text = new TextDecoder().decode(
                  await dependencies.storage.readObject(source.textPublicId),
                );
                const sections: ReadonlyArray<AnalysisSection> = input.sections ?? [
                  "summary",
                  "dates",
                  "action_items",
                ];
                return analyzer.analyze(text, sections);
              },
              async create_report(input, toolContext) {
                if (!toolContext.executionId || !toolContext.sourceDocumentId) {
                  throw new WorkflowStepError("DOCUMENT_REQUIRED");
                }
                const report = await dependencies.reports.create(
                  { userId: toolContext.userId, workspaceId: toolContext.workspaceId },
                  {
                    sourceDocumentId: toolContext.sourceDocumentId,
                    sourceExecutionId: toolContext.executionId,
                    title: input.title,
                    content: toReportJson(ReportContentSchema.parse(input.content)),
                  },
                );
                return {
                  reportId: report.id,
                  content: ReportContentSchema.parse(report.content),
                };
              },
              async replace_report() {
                throw new Error("Report replacement requires the approval gate.");
              },
            },
            (userId, workspaceId) =>
              dependencies.workspaces.isOwner(userId, workspaceId),
            async (workspaceId, candidateDocumentId) => {
              const source = await dependencies.documents.findById(
                { userId: tenant.userId, workspaceId },
                candidateDocumentId,
              );
              return source?.status === "ready";
            },
          );

          const result = await tools.execute(
            node.kind,
            stepInput(node, documentId, outputs),
            {
              userId: tenant.userId,
              workspaceId: tenant.workspaceId,
              executionId: execution.id,
              sourceDocumentId: documentId,
            },
          );
          switch (node.kind) {
            case "extract_document":
              output = { kind: "extraction", documentId };
              break;
            case "analyze_document":
              output = {
                kind: "analysis",
                content: ReportContentSchema.parse(result),
              };
              break;
            case "create_report": {
              const parsed = ReportToolOutputSchema.safeParse(result);
              if (!parsed.success) {
                throw new WorkflowStepError("REPORT_CONTENT_MISSING");
              }
              output = { kind: "report", ...parsed.data };
              break;
            }
          }
        }

        await dependencies.storage.putObject({
          key: publicId,
          body: jsonBytes(output),
          mediaType: "application/json",
        });
      } catch (error) {
        await dependencies.storage.deleteObject(publicId);
        const failure = failureDetails(error);
        await dependencies.executions.failStepAttempt(tenant, {
          executionId: execution.id,
          executionStepId: step.id,
          attemptId: attempt.attemptId,
          attemptNumber: attempt.attemptNumber,
          errorCode: failure.errorCode,
        });
        const retry = getRetryDecision({
          failureKind: failure.transient ? "transient" : "permanent",
          explicitlyRetryable: failure.transient,
          attemptNumber: attempt.attemptNumber,
        });
        if (retry.retry && attempt.attemptNumber < MAX_AUTOMATIC_ATTEMPTS) {
          await retryDelay(retry.delayMs);
          return "advanced";
        }
        await dependencies.executions.finish(tenant, {
          executionId: execution.id,
          status: "failed",
          errorCode: failure.errorCode,
        });
        return "stopped";
      }

      const persisted = await dependencies.executions.completeStepAttempt(tenant, {
        executionId: execution.id,
        executionStepId: step.id,
        attemptId: attempt.attemptId,
        sourceDocumentId: documentId,
        asset: {
          publicId,
          resourceType: "raw",
          deliveryType: "authenticated",
          format: "json",
        },
        elapsedMs: Date.now() - startedAt,
      });
      if (!persisted) {
        await dependencies.storage.deleteObject(publicId);
        return "stopped";
      }
      return "advanced";
    }
  };
}

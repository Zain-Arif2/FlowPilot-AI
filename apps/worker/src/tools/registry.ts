import { z } from "zod";

const DocumentInputSchema = z.object({ documentId: z.string().uuid() }).strict();
const AnalyzeDocumentInputSchema = DocumentInputSchema.extend({
  sections: z
    .array(z.enum(["summary", "dates", "action_items"]))
    .min(1)
    .optional(),
}).strict();
const CreateReportInputSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    content: z
      .object({
        summary: z.string().optional(),
        dates: z.array(z.string()).optional(),
        actionItems: z.array(z.string()).optional(),
      })
      .strict(),
  })
  .strict();
const ReplaceReportInputSchema = z
  .object({
    reportId: z.string().uuid(),
    content: CreateReportInputSchema.shape.content,
  })
  .strict();

export const ApprovedToolNameSchema = z.enum([
  "extract_document",
  "analyze_document",
  "create_report",
  "replace_report",
]);

export type ApprovedToolName = z.infer<typeof ApprovedToolNameSchema>;

export const APPROVED_TOOL_POLICIES = {
  extract_document: { idempotency: "idempotent", requiresApproval: false },
  analyze_document: { idempotency: "idempotent", requiresApproval: false },
  create_report: { idempotency: "deduplicated", requiresApproval: false },
  replace_report: { idempotency: "non_repeatable", requiresApproval: true },
} as const;

export interface ToolExecutionContext {
  readonly userId: string;
  readonly workspaceId: string;
  readonly executionId?: string;
  readonly sourceDocumentId?: string;
  readonly approvalId?: string;
}

export interface ToolHandlers {
  readonly extract_document: (
    input: z.infer<typeof DocumentInputSchema>,
    context: ToolExecutionContext,
  ) => Promise<unknown>;
  readonly analyze_document: (
    input: z.infer<typeof AnalyzeDocumentInputSchema>,
    context: ToolExecutionContext,
  ) => Promise<unknown>;
  readonly create_report: (
    input: z.infer<typeof CreateReportInputSchema>,
    context: ToolExecutionContext,
  ) => Promise<unknown>;
  readonly replace_report: (
    input: z.infer<typeof ReplaceReportInputSchema>,
    context: ToolExecutionContext,
  ) => Promise<unknown>;
}

export type DocumentAuthorizer = (
  workspaceId: string,
  documentId: string,
) => Promise<boolean>;

export type WorkspaceAuthorizer = (
  userId: string,
  workspaceId: string,
) => Promise<boolean>;

export class ToolAuthorizationError extends Error {
  constructor(
    readonly code:
      | "TOOL_NOT_APPROVED"
      | "WORKSPACE_NOT_OWNED"
      | "DOCUMENT_NOT_OWNED"
      | "APPROVAL_REQUIRED",
  ) {
    super("The requested tool action is not authorized.");
    this.name = "ToolAuthorizationError";
  }
}

export class ToolInputError extends Error {
  constructor() {
    super("Tool input is invalid.");
    this.name = "ToolInputError";
  }
}

function parseToolInput<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  input: unknown,
): z.infer<TSchema> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ToolInputError();
  return parsed.data;
}

export function createToolRegistry(
  handlers: ToolHandlers,
  authorizeWorkspace: WorkspaceAuthorizer,
  authorizeDocument: DocumentAuthorizer,
) {
  return {
    async execute(
      name: string,
      input: unknown,
      context: ToolExecutionContext,
    ): Promise<unknown> {
      const parsedName = ApprovedToolNameSchema.safeParse(name);
      if (!parsedName.success) throw new ToolAuthorizationError("TOOL_NOT_APPROVED");
      const toolName = parsedName.data;
      if (!(await authorizeWorkspace(context.userId, context.workspaceId))) {
        throw new ToolAuthorizationError("WORKSPACE_NOT_OWNED");
      }
      if (APPROVED_TOOL_POLICIES[toolName].requiresApproval && !context.approvalId) {
        throw new ToolAuthorizationError("APPROVAL_REQUIRED");
      }

      switch (toolName) {
        case "extract_document": {
          const parsedInput = parseToolInput(DocumentInputSchema, input);
          if (!(await authorizeDocument(context.workspaceId, parsedInput.documentId))) {
            throw new ToolAuthorizationError("DOCUMENT_NOT_OWNED");
          }
          return handlers.extract_document(parsedInput, context);
        }
        case "analyze_document": {
          const parsedInput = parseToolInput(AnalyzeDocumentInputSchema, input);
          if (!(await authorizeDocument(context.workspaceId, parsedInput.documentId))) {
            throw new ToolAuthorizationError("DOCUMENT_NOT_OWNED");
          }
          return handlers.analyze_document(parsedInput, context);
        }
        case "create_report": {
          const parsedInput = parseToolInput(CreateReportInputSchema, input);
          return handlers.create_report(parsedInput, context);
        }
        case "replace_report": {
          const parsedInput = parseToolInput(ReplaceReportInputSchema, input);
          return handlers.replace_report(parsedInput, context);
        }
      }
    },
  };
}

import { z } from "zod";

const PositionSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
  })
  .strict();

const NodeBaseSchema = z.object({
  id: z.string().min(1).max(64),
  position: PositionSchema,
});

const ExtractDocumentNodeSchema = NodeBaseSchema.extend({
  kind: z.literal("extract_document"),
  config: z.object({}).strict(),
}).strict();

const AnalyzeDocumentNodeSchema = NodeBaseSchema.extend({
  kind: z.literal("analyze_document"),
  config: z
    .object({
      sections: z
        .array(z.enum(["summary", "dates", "action_items"]))
        .min(1)
        .refine((sections) => new Set(sections).size === sections.length),
    })
    .strict(),
}).strict();

const CreateReportNodeSchema = NodeBaseSchema.extend({
  kind: z.literal("create_report"),
  config: z
    .object({
      title: z.string().trim().min(1).max(120),
    })
    .strict(),
}).strict();

const ReplaceReportNodeSchema = NodeBaseSchema.extend({
  kind: z.literal("replace_report"),
  config: z
    .object({
      reportId: z.string().uuid(),
    })
    .strict(),
}).strict();

const ConditionConfigSchema = z.discriminatedUnion("field", [
  z
    .object({
      field: z.literal("has_action_items"),
      operator: z.literal("equals"),
      value: z.boolean(),
    })
    .strict(),
  z
    .object({
      field: z.literal("date_count"),
      operator: z.enum(["equals", "greater_than"]),
      value: z.number().int().nonnegative(),
    })
    .strict(),
]);

const ConditionNodeSchema = NodeBaseSchema.extend({
  kind: z.literal("condition"),
  config: ConditionConfigSchema,
}).strict();

export const WorkflowNodeSchema = z.discriminatedUnion("kind", [
  ExtractDocumentNodeSchema,
  AnalyzeDocumentNodeSchema,
  CreateReportNodeSchema,
  ReplaceReportNodeSchema,
  ConditionNodeSchema,
]);

export const WorkflowEdgeSchema = z
  .object({
    id: z.string().min(1).max(128),
    source: z.string().min(1).max(64),
    target: z.string().min(1).max(64),
    branch: z.enum(["true", "false"]).optional(),
  })
  .strict();

export const WorkflowDefinitionSchema = z
  .object({
    version: z.literal(1),
    nodes: z.array(WorkflowNodeSchema).min(1).max(25),
    edges: z.array(WorkflowEdgeSchema).max(60),
  })
  .strict();

export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;
export type ConditionConfig = z.infer<typeof ConditionConfigSchema>;

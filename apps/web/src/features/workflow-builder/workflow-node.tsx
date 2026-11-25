"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { WorkflowNode } from "@flowpilot/shared";
import {
  FileCheck2,
  FileDiff,
  FileText,
  GitBranch,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../../lib/utils.js";

export interface WorkflowStepData {
  readonly [key: string]: unknown;
  readonly workflowNode: WorkflowNode;
}

export type CanvasNode = Node<WorkflowStepData, "workflowStep">;

export interface NodeKindMeta {
  readonly kind: WorkflowNode["kind"];
  readonly label: string;
  readonly shortDesc: string;
  readonly icon: LucideIcon;
  readonly badgeClass: string;
}

export const NODE_KIND_META: Record<WorkflowNode["kind"], NodeKindMeta> = {
  extract_document: {
    kind: "extract_document",
    label: "Extract document",
    shortDesc: "Read source text from file",
    icon: FileText,
    badgeClass: "bg-sky-50 text-sky-700 border-sky-200/70",
  },
  analyze_document: {
    kind: "analyze_document",
    label: "Analyze with AI",
    shortDesc: "Extract summary, dates & actions",
    icon: Sparkles,
    badgeClass: "bg-[#f2effc] text-[#6d4aff] border-[#dfd7fa]",
  },
  create_report: {
    kind: "create_report",
    label: "Create report",
    shortDesc: "Save a new structured report",
    icon: FileCheck2,
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200/70",
  },
  replace_report: {
    kind: "replace_report",
    label: "Replace report",
    shortDesc: "Update report (requires approval)",
    icon: FileDiff,
    badgeClass: "bg-amber-50 text-amber-800 border-amber-200/70",
  },
  condition: {
    kind: "condition",
    label: "Condition",
    shortDesc: "Branch on analysis results",
    icon: GitBranch,
    badgeClass: "bg-violet-50 text-violet-700 border-violet-200/70",
  },
};

export function WorkflowStepNode({ data, selected }: NodeProps<CanvasNode>) {
  const node = data.workflowNode;
  const meta = NODE_KIND_META[node.kind];
  const Icon = meta.icon;

  return (
    <article
      className={cn(
        "w-[228px] rounded-xl border bg-white px-3.5 py-3 shadow-[0_2px_10px_rgb(20_18_32/0.06)] transition-all",
        selected
          ? "border-[#6d4aff] ring-2 ring-[#6d4aff]/20 shadow-[0_6px_20px_rgb(109_74_255/0.14)]"
          : "border-[#e2e2ec] hover:border-[#c8c5dc]",
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2.5 !w-2.5 !border-2 !border-white !bg-[#6d4aff]"
      />

      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
            meta.badgeClass,
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#7b7a89]">
            {meta.label}
          </p>
          <p className="mt-0.5 truncate text-xs font-medium text-[#18181f]">
            {node.kind === "extract_document" && "Selected source file"}
            {node.kind === "analyze_document" &&
              `${node.config.sections.length} section${node.config.sections.length === 1 ? "" : "s"}`}
            {node.kind === "create_report" && node.config.title}
            {node.kind === "replace_report" && "Target report (approval)"}
            {node.kind === "condition" &&
              `${node.config.field.replaceAll("_", " ")} ${node.config.operator.replaceAll("_", " ")}`}
          </p>
        </div>
      </div>

      {node.kind === "condition" ? (
        <div className="relative mt-3 flex items-center justify-between border-t border-[#efeff4] pt-2 text-[11px] font-semibold">
          <span className="text-emerald-700">True</span>
          <span className="text-rose-700">False</span>
          <Handle
            id="true"
            type="source"
            position={Position.Bottom}
            style={{ left: "26%" }}
            className="!h-2.5 !w-2.5 !border-2 !border-white !bg-emerald-600"
          />
          <Handle
            id="false"
            type="source"
            position={Position.Bottom}
            style={{ left: "74%" }}
            className="!h-2.5 !w-2.5 !border-2 !border-white !bg-rose-600"
          />
        </div>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!h-2.5 !w-2.5 !border-2 !border-white !bg-[#6d4aff]"
        />
      )}
    </article>
  );
}

export const workflowNodeTypes = { workflowStep: WorkflowStepNode };


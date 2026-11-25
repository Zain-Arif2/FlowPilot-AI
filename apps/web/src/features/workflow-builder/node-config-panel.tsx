"use client";

import type {
  ConditionConfig,
  ReportDto,
  WorkflowNode,
} from "@flowpilot/shared";
import { AlertTriangle, ArrowDown, CheckCircle2, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/button.js";
import { Input, Label, Select } from "../../components/ui/input.js";
import { NODE_KIND_META } from "./workflow-node.js";

interface NodeConfigPanelProps {
  readonly node: WorkflowNode | null;
  readonly reports: readonly ReportDto[];
  readonly validationErrors: readonly string[];
  readonly onChangeNode: (updated: WorkflowNode) => void;
  readonly onDeleteNode: (nodeId: string) => void;
}

function ConditionEditor({
  config,
  onChange,
}: {
  readonly config: ConditionConfig;
  readonly onChange: (config: ConditionConfig) => void;
}) {
  function changeField(field: ConditionConfig["field"]) {
    if (field === "has_action_items") {
      onChange({
        field: "has_action_items",
        operator: "equals",
        value: true,
      });
      return;
    }
    onChange({
      field: "date_count",
      operator: "greater_than",
      value: 0,
    });
  }

  return (
    <div className="space-y-3.5">
      <div>
        <Label htmlFor="cond-field" className="mb-1.5">
          Condition field
        </Label>
        <Select
          id="cond-field"
          value={config.field}
          onChange={(event) => {
            const field =
              event.currentTarget.value === "date_count"
                ? "date_count"
                : "has_action_items";
            changeField(field);
          }}
        >
          <option value="has_action_items">Has action items</option>
          <option value="date_count">Number of dates</option>
        </Select>
      </div>

      {config.field === "has_action_items" ? (
        <div>
          <Label htmlFor="cond-bool-val" className="mb-1.5">
            Expected value
          </Label>
          <Select
            id="cond-bool-val"
            value={String(config.value)}
            onChange={(event) =>
              onChange({
                field: "has_action_items",
                operator: "equals",
                value: event.currentTarget.value === "true",
              })
            }
          >
            <option value="true">Yes (has action items)</option>
            <option value="false">No (no action items)</option>
          </Select>
        </div>
      ) : (
        <>
          <div>
            <Label htmlFor="cond-operator" className="mb-1.5">
              Comparison
            </Label>
            <Select
              id="cond-operator"
              value={config.operator}
              onChange={(event) =>
                onChange({
                  field: "date_count",
                  operator:
                    event.currentTarget.value === "equals"
                      ? "equals"
                      : "greater_than",
                  value: config.value,
                })
              }
            >
              <option value="greater_than">Greater than</option>
              <option value="equals">Equals</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="cond-num-val" className="mb-1.5">
              Date count threshold
            </Label>
            <Input
              id="cond-num-val"
              type="number"
              min={0}
              step={1}
              value={config.value}
              onChange={(event) =>
                onChange({
                  field: "date_count",
                  operator: config.operator,
                  value: Math.max(
                    0,
                    Math.floor(Number(event.currentTarget.value) || 0),
                  ),
                })
              }
            />
          </div>
        </>
      )}

      <div className="flex items-start gap-2 rounded-lg border border-[#e6e6ee] bg-[#fafafe] p-2.5 text-xs text-[#686876]">
        <ArrowDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#6d4aff]" aria-hidden="true" />
        <span>
          Connect both the <strong>True</strong> and <strong>False</strong>{" "}
          handles on this node to separate downstream steps.
        </span>
      </div>
    </div>
  );
}

export function NodeConfigPanel({
  node,
  reports,
  validationErrors,
  onChangeNode,
  onDeleteNode,
}: NodeConfigPanelProps) {
  if (!node) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-[#18181f]">
            Workflow inspector
          </h3>
          <p className="mt-1 text-xs text-[#686876]">
            Click any step on the canvas to configure its settings, or drag new
            steps from the palette.
          </p>
        </div>

        <div className="rounded-xl border border-[#e6e6ee] bg-[#fafafe] p-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#18181f]">
            {validationErrors.length === 0 ? (
              <>
                <CheckCircle2
                  className="h-4 w-4 text-emerald-600"
                  aria-hidden="true"
                />
                <span>Graph is valid and ready to save</span>
              </>
            ) : (
              <>
                <AlertTriangle
                  className="h-4 w-4 text-amber-600"
                  aria-hidden="true"
                />
                <span>
                  {validationErrors.length} validation{" "}
                  {validationErrors.length === 1 ? "issue" : "issues"}
                </span>
              </>
            )}
          </div>
          {validationErrors.length > 0 ? (
            <ul className="mt-2.5 list-disc space-y-1 pl-4 text-xs text-amber-800">
              {validationErrors.map((err, idx) => (
                <li key={`val-err-${idx}`}>{err}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    );
  }

  const meta = NODE_KIND_META[node.kind];
  const Icon = meta.icon;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 border-b border-[#efeff4] pb-4">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${meta.badgeClass}`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[#18181f]">{meta.label}</h3>
          <p className="text-xs text-[#686876]">{meta.shortDesc}</p>
        </div>
      </div>

      {node.kind === "extract_document" ? (
        <p className="rounded-lg border border-[#e6e6ee] bg-[#fafafe] p-3 text-xs leading-relaxed text-[#545363]">
          Extracts text from the ready document selected when starting the
          workflow execution. No extra configuration required.
        </p>
      ) : null}

      {node.kind === "analyze_document" ? (
        <fieldset className="space-y-2.5">
          <legend className="text-xs font-semibold text-[#383745]">
            Analysis sections
          </legend>
          {(["summary", "dates", "action_items"] as const).map((section) => {
            const checked = node.config.sections.includes(section);
            const isLast = checked && node.config.sections.length === 1;
            return (
              <label
                key={section}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-[#e6e6ee] bg-white px-3 py-2 text-sm text-[#18181f] hover:bg-[#fafafe]"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={isLast}
                  onChange={(event) => {
                    const nextSections = event.currentTarget.checked
                      ? [...node.config.sections, section]
                      : node.config.sections.filter((item) => item !== section);
                    onChangeNode({
                      ...node,
                      config: { sections: nextSections },
                    });
                  }}
                  className="h-4 w-4 rounded border-[#cfcfe0] text-[#6d4aff] focus:ring-[#6d4aff]"
                />
                <span className="capitalize">
                  {section.replaceAll("_", " ")}
                </span>
              </label>
            );
          })}
        </fieldset>
      ) : null}

      {node.kind === "create_report" ? (
        <div>
          <Label htmlFor="create-report-title" className="mb-1.5">
            Report title
          </Label>
          <Input
            id="create-report-title"
            maxLength={120}
            value={node.config.title}
            onChange={(event) =>
              onChangeNode({
                ...node,
                config: { title: event.currentTarget.value },
              })
            }
          />
        </div>
      ) : null}

      {node.kind === "replace_report" ? (
        <div>
          <Label htmlFor="replace-report-select" className="mb-1.5">
            Target report to replace
          </Label>
          <Select
            id="replace-report-select"
            value={node.config.reportId}
            onChange={(event) =>
              onChangeNode({
                ...node,
                config: { reportId: event.currentTarget.value },
              })
            }
          >
            <option value="">Select a report</option>
            {reports.map((report) => (
              <option key={report.id} value={report.id}>
                {report.title} (rev {report.revision})
              </option>
            ))}
          </Select>
          <p className="mt-1.5 text-xs text-[#686876]">
            Replacing an existing report pauses execution for owner approval.
          </p>
        </div>
      ) : null}

      {node.kind === "condition" ? (
        <ConditionEditor
          config={node.config}
          onChange={(config) => onChangeNode({ ...node, config })}
        />
      ) : null}

      <div className="border-t border-[#efeff4] pt-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onDeleteNode(node.id)}
          className="w-full text-rose-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          Remove step
        </Button>
      </div>
    </div>
  );
}


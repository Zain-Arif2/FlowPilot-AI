"use client";

import "@xyflow/react/dist/style.css";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type EdgeChangeset,
  type NodeChangeset,
} from "@xyflow/react";
import {
  ExecutionSchema,
  WorkflowProposalSchema,
  WorkflowSchema,
  addWorkflowNode,
  connectWorkflowNodes,
  createWorkflowNode,
  removeWorkflowNode,
  validateWorkflowGraph,
  type DocumentDto,
  type ReportDto,
  type WorkflowDefinition,
  type WorkflowDto,
  type WorkflowNode,
  type Workspace,
} from "@flowpilot/shared";
import {
  AlertTriangle,
  CheckCircle2,
  Play,
  Plus,
  RefreshCw,
  Save,
  SlidersHorizontal,
  Sparkles,
  Wand2,
} from "lucide-react";
import {
  ApiRequestError,
  apiRequest,
  getErrorMessage,
} from "../../lib/api.js";
import { Badge } from "../../components/ui/badge.js";
import { Button } from "../../components/ui/button.js";
import { Dialog } from "../../components/ui/dialog.js";
import { Input, Label, Select, Textarea } from "../../components/ui/input.js";
import { Sheet } from "../../components/ui/sheet.js";
import { useToast } from "../../components/ui/toast.js";
import {
  createInitialCanvasState,
  createInitialWorkflowDefinition,
  fromCanvas,
  toCanvasEdges,
  toCanvasNodes,
  type CanvasEdge,
} from "./canvas-graph.js";
import { NodeConfigPanel } from "./node-config-panel.js";
import {
  NODE_KIND_META,
  workflowNodeTypes,
  type CanvasNode,
} from "./workflow-node.js";

const PALETTE_KINDS: readonly WorkflowNode["kind"][] = [
  "extract_document",
  "analyze_document",
  "create_report",
  "replace_report",
  "condition",
];

interface WorkflowBuilderInnerProps {
  readonly workspace: Workspace;
  readonly workflows: readonly WorkflowDto[];
  readonly documents: readonly DocumentDto[];
  readonly reports: readonly ReportDto[];
  readonly initialWorkflowId?: string | null;
  readonly initialProposal?: {
    readonly definition: WorkflowDefinition;
    readonly warnings: readonly string[];
  } | null;
  readonly onWorkflowSaved: (workflow: WorkflowDto) => void;
  readonly onExecutionStarted: (executionId: string) => void;
  readonly onReload: () => Promise<void>;
}

function WorkflowBuilderInner({
  workspace,
  workflows,
  documents,
  reports,
  initialWorkflowId,
  initialProposal,
  onWorkflowSaved,
  onExecutionStarted,
  onReload,
}: WorkflowBuilderInnerProps) {
  const { notify } = useToast();
  const { screenToFlowPosition, fitView } = useReactFlow();
  const canvasWrapperRef = useRef<HTMLDivElement>(null);

  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(
    null,
  );
  const [workflowName, setWorkflowName] = useState("Document summary workflow");
  const [workflowRevision, setWorkflowRevision] = useState<number | null>(null);
  const [initialCanvasState] = useState(createInitialCanvasState);
  const [nodes, setNodes] = useState(initialCanvasState.nodes);
  const [edges, setEdges] = useState(initialCanvasState.edges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [loadingWorkflow, setLoadingWorkflow] = useState(false);
  const [staleConflict, setStaleConflict] = useState(false);

  // AI Generation Dialog
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState(
    "Extract the document, analyze summary, dates, and action items, and create a structured report.",
  );
  const [aiDocId, setAiDocId] = useState("");
  const [generatingAi, setGeneratingAi] = useState(false);

  // Run Workflow Dialog
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [runDocId, setRunDocId] = useState("");
  const [running, setRunning] = useState(false);

  const workspacePath = `/workspaces/${encodeURIComponent(workspace.id)}`;
  const readyDocuments = useMemo(
    () => documents.filter((doc) => doc.status === "ready"),
    [documents],
  );

  const selectedNode = useMemo(
    () =>
      nodes.find((node) => node.id === selectedNodeId)?.data.workflowNode ??
      null,
    [nodes, selectedNodeId],
  );

  const definition = useMemo(() => fromCanvas(nodes, edges), [nodes, edges]);
  const validation = useMemo(
    () => validateWorkflowGraph(definition),
    [definition],
  );
  const validationErrors = useMemo(
    () => (validation.success ? [] : validation.issues),
    [validation],
  );

  const setGraph = useCallback(
    (nextDefinition: WorkflowDefinition) => {
      setNodes(toCanvasNodes(nextDefinition));
      setEdges(toCanvasEdges(nextDefinition));
      setSelectedNodeId(null);
      window.requestAnimationFrame(() => {
        void fitView({ padding: 0.2, duration: 250 });
      });
    },
    [fitView],
  );

  const openWorkflow = useCallback(
    async (workflowId: string) => {
      setStaleConflict(false);
      setLoadingWorkflow(true);
      try {
        const wf = await apiRequest(
          `${workspacePath}/workflows/${encodeURIComponent(workflowId)}`,
          WorkflowSchema,
        );
        setSelectedWorkflowId(wf.id);
        setWorkflowName(wf.name);
        setWorkflowRevision(wf.revision);
        setGraph(wf.definition);
      } catch (error) {
        notify({
          tone: "error",
          title: "Could not load workflow",
          description: getErrorMessage(error),
        });
      } finally {
        setLoadingWorkflow(false);
      }
    },
    [notify, setGraph, workspacePath],
  );

  useEffect(() => {
    if (initialProposal) {
      setSelectedWorkflowId(null);
      setWorkflowRevision(null);
      setWorkflowName("AI generated workflow");
      setGraph(initialProposal.definition);
      return;
    }
    if (initialWorkflowId) {
      void openWorkflow(initialWorkflowId);
    }
  }, [initialProposal, initialWorkflowId, openWorkflow, setGraph]);

  function startNewWorkflow() {
    setSelectedWorkflowId(null);
    setWorkflowRevision(null);
    setWorkflowName("Untitled workflow");
    setStaleConflict(false);
    setGraph(createInitialWorkflowDefinition());
  }

  function handleNodesChange(changes: NodeChangeset<CanvasNode>) {
    const changeList = changes.toArray();
    const removedIds = new Set(
      changeList
        .filter((change) => change.type === "remove")
        .map((change) => change.id),
    );
    setNodes((current) =>
      changes.applyTo(current).map((node) => ({
        ...node,
        data: {
          workflowNode: {
            ...node.data.workflowNode,
            position: node.position,
          },
        },
      })),
    );
    if (removedIds.size > 0) {
      setEdges((current) =>
        current.filter(
          (edge) => !removedIds.has(edge.source) && !removedIds.has(edge.target),
        ),
      );
      setSelectedNodeId((current) =>
        current && removedIds.has(current) ? null : current,
      );
    }
  }

  function handleEdgesChange(changes: EdgeChangeset<CanvasEdge>) {
    setEdges((current) => changes.applyTo(current));
  }

  function handleConnect(connection: Connection) {
    if (!connection.source || !connection.target) return;
    try {
      const next = connectWorkflowNodes(definition, {
        id: crypto.randomUUID(),
        source: connection.source,
        target: connection.target,
        ...(connection.sourceHandle === null
          ? {}
          : { sourceHandle: connection.sourceHandle }),
      });
      setEdges(toCanvasEdges(next));
    } catch (error) {
      notify({
        tone: "warning",
        title: "Invalid connection",
        description: getErrorMessage(error),
      });
    }
  }

  function addNodeAt(
    kind: WorkflowNode["kind"],
    position: { readonly x: number; readonly y: number },
  ) {
    try {
      const reportId = kind === "replace_report" ? reports[0]?.id : undefined;
      const node = createWorkflowNode(
        kind,
        crypto.randomUUID(),
        position,
        reportId,
      );
      const next = addWorkflowNode(definition, node);
      setNodes(toCanvasNodes(next));
      setSelectedNodeId(node.id);
    } catch (error) {
      notify({
        tone: "warning",
        title: "Cannot add step",
        description: getErrorMessage(error),
      });
    }
  }

  function handleDragStart(
    event: DragEvent<HTMLButtonElement>,
    kind: WorkflowNode["kind"],
  ) {
    event.dataTransfer.setData("application/flowpilot-node", kind);
    event.dataTransfer.effectAllowed = "move";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const kind = event.dataTransfer.getData(
      "application/flowpilot-node",
    ) as WorkflowNode["kind"];
    if (!kind || !(kind in NODE_KIND_META)) return;
    const position = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    addNodeAt(kind, position);
  }

  function updateNode(updated: WorkflowNode) {
    setNodes((current) =>
      current.map((item) =>
        item.id === updated.id
          ? { ...item, data: { workflowNode: updated } }
          : item,
      ),
    );
  }

  function deleteNode(nodeId: string) {
    try {
      setGraph(removeWorkflowNode(definition, nodeId));
      setMobileInspectorOpen(false);
    } catch (error) {
      notify({
        tone: "error",
        title: "Could not remove step",
        description: getErrorMessage(error),
      });
    }
  }

  async function saveWorkflow(): Promise<WorkflowDto | null> {
    if (!validation.success) {
      notify({
        tone: "warning",
        title: "Fix validation issues",
        description:
          validation.issues[0] ?? "Resolve graph errors before saving.",
      });
      return null;
    }
    const trimmedName = workflowName.trim();
    if (!trimmedName) {
      notify({
        tone: "warning",
        title: "Workflow name required",
        description: "Enter a name for this workflow.",
      });
      return null;
    }

    setSaving(true);
    setStaleConflict(false);
    try {
      const saved = selectedWorkflowId
        ? await apiRequest(
            `${workspacePath}/workflows/${encodeURIComponent(selectedWorkflowId)}`,
            WorkflowSchema,
            {
              method: "PUT",
              headers: { "If-Match": `"workflow-${workflowRevision}"` },
              body: { name: trimmedName, definition: validation.data },
            },
          )
        : await apiRequest(`${workspacePath}/workflows`, WorkflowSchema, {
            method: "POST",
            body: { name: trimmedName, definition: validation.data },
          });
      setSelectedWorkflowId(saved.id);
      setWorkflowRevision(saved.revision);
      setWorkflowName(saved.name);
      setGraph(saved.definition);
      onWorkflowSaved(saved);
      notify({
        tone: "success",
        title: "Workflow saved",
        description: `"${saved.name}" (rev ${saved.revision}) is ready to run.`,
      });
      return saved;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) {
        setStaleConflict(true);
        notify({
          tone: "warning",
          title: "Revision conflict",
          description:
            "This workflow was modified elsewhere. Reload it before saving.",
        });
      } else {
        notify({
          tone: "error",
          title: "Save failed",
          description: getErrorMessage(error),
        });
      }
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateAi(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!aiPrompt.trim()) return;
    setGeneratingAi(true);
    try {
      const proposal = await apiRequest(
        `${workspacePath}/workflow-proposals`,
        WorkflowProposalSchema,
        {
          method: "POST",
          body: {
            prompt: aiPrompt.trim(),
            ...(aiDocId ? { documentId: aiDocId } : {}),
          },
        },
      );
      setSelectedWorkflowId(null);
      setWorkflowRevision(null);
      setWorkflowName("AI generated workflow");
      setGraph(proposal.definition);
      setAiDialogOpen(false);
      notify({
        tone: proposal.warnings.length > 0 ? "warning" : "success",
        title: "Workflow generated",
        description:
          proposal.warnings[0] ??
          "Review the steps on the canvas and click Save when ready.",
      });
    } catch (error) {
      notify({
        tone: "error",
        title: "AI generation failed",
        description: getErrorMessage(error),
      });
    } finally {
      setGeneratingAi(false);
    }
  }

  async function handleRunWorkflow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!runDocId) {
      notify({
        tone: "warning",
        title: "Select a document",
        description: "Choose a ready document to run this workflow on.",
      });
      return;
    }
    setRunning(true);
    try {
      let wfId = selectedWorkflowId;
      let wfRev = workflowRevision;
      if (!wfId || !wfRev) {
        const saved = await saveWorkflow();
        if (!saved) {
          setRunning(false);
          return;
        }
        wfId = saved.id;
        wfRev = saved.revision;
      }

      const execution = await apiRequest(
        `${workspacePath}/workflows/${encodeURIComponent(wfId)}/executions`,
        ExecutionSchema,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: {
            workflowRevision: wfRev,
            documentId: runDocId,
          },
        },
      );
      setRunDialogOpen(false);
      notify({
        tone: "success",
        title: "Workflow execution started",
        description: `Run status: ${execution.status}.`,
      });
      await onReload();
      onExecutionStarted(execution.id);
    } catch (error) {
      notify({
        tone: "error",
        title: "Could not start execution",
        description: getErrorMessage(error),
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Top Toolbar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-[#e6e6ee] bg-white p-3.5 shadow-[0_1px_2px_rgb(20_18_32/0.04)] lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="sm:w-52">
            <Select
              aria-label="Select workflow"
              value={selectedWorkflowId ?? "__new__"}
              onChange={(event) => {
                const val = event.currentTarget.value;
                if (val === "__new__") {
                  startNewWorkflow();
                } else {
                  void openWorkflow(val);
                }
              }}
            >
              <option value="__new__">+ New workflow</option>
              {workflows.map((wf) => (
                <option key={wf.id} value={wf.id}>
                  {wf.name} (rev {wf.revision})
                </option>
              ))}
            </Select>
          </div>

          <div className="flex-1 sm:min-w-[200px]">
            <Input
              aria-label="Workflow name"
              maxLength={120}
              placeholder="Workflow name"
              value={workflowName}
              onChange={(event) => setWorkflowName(event.currentTarget.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={workflowRevision ? "purple" : "default"}>
              {workflowRevision ? `Rev ${workflowRevision}` : "Unsaved draft"}
            </Badge>
            {validation.success ? (
              <Badge variant="success">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                Valid
              </Badge>
            ) : (
              <Badge variant="warning">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                {validationErrors.length}{" "}
                {validationErrors.length === 1 ? "issue" : "issues"}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {staleConflict && selectedWorkflowId ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void openWorkflow(selectedWorkflowId)}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Reload latest
            </Button>
          ) : null}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setAiDialogOpen(true)}
          >
            <Sparkles className="h-3.5 w-3.5 text-[#6d4aff]" aria-hidden="true" />
            AI Generate
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setMobileInspectorOpen(true)}
            className="lg:hidden"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            Inspector
          </Button>

          <Button
            variant="secondary"
            size="sm"
            disabled={saving || !validation.success}
            onClick={() => void saveWorkflow()}
          >
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            {saving ? "Saving..." : "Save"}
          </Button>

          <Button
            size="sm"
            disabled={!validation.success}
            onClick={() => {
              setRunDocId(readyDocuments[0]?.id ?? "");
              setRunDialogOpen(true);
            }}
          >
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            Run
          </Button>
        </div>
      </div>

      {/* Node Palette */}
      <div className="flex items-center gap-2 overflow-x-auto rounded-xl border border-[#e6e6ee] bg-white px-3 py-2.5">
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-[#7b7a89]">
          Add step:
        </span>
        {PALETTE_KINDS.map((kind) => {
          const meta = NODE_KIND_META[kind];
          const Icon = meta.icon;
          return (
            <button
              key={kind}
              type="button"
              draggable
              onDragStart={(event) => handleDragStart(event, kind)}
              onClick={() =>
                addNodeAt(kind, {
                  x: 120 + (nodes.length % 3) * 240,
                  y: 60 + Math.floor(nodes.length / 3) * 150,
                })
              }
              title={`Drag onto canvas or click to add ${meta.label}`}
              className="inline-flex shrink-0 cursor-grab items-center gap-1.5 rounded-lg border border-[#e3e2ec] bg-[#fafafe] px-2.5 py-1.5 text-xs font-medium text-[#22212c] transition-colors hover:border-[#6d4aff]/50 hover:bg-[#f2effc] active:cursor-grabbing"
            >
              <Icon className="h-3.5 w-3.5 text-[#6d4aff]" aria-hidden="true" />
              <span>{meta.label}</span>
              <Plus className="h-3 w-3 text-[#8a889a]" aria-hidden="true" />
            </button>
          );
        })}
      </div>

      {/* Canvas + Desktop Side Inspector */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div
          ref={canvasWrapperRef}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={handleDrop}
          className="relative h-[56vh] min-h-[360px] w-full overflow-hidden rounded-2xl border border-[#e6e6ee] bg-white shadow-[0_1px_2px_rgb(20_18_32/0.04)] sm:h-[520px] lg:h-[calc(100vh-17.5rem)]"
        >
          {loadingWorkflow ? (
            <div
              role="status"
              aria-label="Loading workflow"
              className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-white/80 backdrop-blur-[1px]"
            >
              <RefreshCw
                className="h-5 w-5 animate-spin text-[#6d4aff]"
                aria-hidden="true"
              />
              <span className="text-xs font-medium text-[#545363]">
                Loading workflow...
              </span>
            </div>
          ) : null}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={workflowNodeTypes}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
            onNodeClick={(_event, node) => {
              setSelectedNodeId(node.id);
              if (window.innerWidth < 1024) {
                setMobileInspectorOpen(true);
              }
            }}
            onPaneClick={() => setSelectedNodeId(null)}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            deleteKeyCode={["Backspace", "Delete"]}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={18}
              size={1.2}
              color="#d7d5e4"
            />
            <Controls showInteractive={false} />
            <MiniMap
              className="hidden sm:block"
              nodeColor="#6d4aff"
              maskColor="rgb(248 248 250 / 0.7)"
            />
          </ReactFlow>
        </div>

        {/* Desktop Side Panel */}
        <aside
          aria-label="Node configuration"
          className="hidden rounded-2xl border border-[#e6e6ee] bg-white p-5 shadow-[0_1px_2px_rgb(20_18_32/0.04)] lg:block lg:h-[calc(100vh-17.5rem)] lg:overflow-y-auto"
        >
          <NodeConfigPanel
            node={selectedNode}
            reports={reports}
            validationErrors={validationErrors}
            onChangeNode={updateNode}
            onDeleteNode={deleteNode}
          />
        </aside>
      </div>

      {/* Mobile / Tablet Inspector Sheet */}
      <Sheet
        open={mobileInspectorOpen}
        onClose={() => setMobileInspectorOpen(false)}
        title={selectedNode ? NODE_KIND_META[selectedNode.kind].label : "Workflow inspector"}
        description={
          selectedNode
            ? "Configure this step's behavior"
            : "Validation status & graph overview"
        }
      >
        <NodeConfigPanel
          node={selectedNode}
          reports={reports}
          validationErrors={validationErrors}
          onChangeNode={updateNode}
          onDeleteNode={deleteNode}
        />
      </Sheet>

      {/* AI Workflow Generation Dialog */}
      <Dialog
        open={aiDialogOpen}
        onClose={() => setAiDialogOpen(false)}
        title="Generate workflow with AI"
        description="Describe the steps you want. FlowPilot AI creates a validated DAG on the canvas."
      >
        <form onSubmit={handleGenerateAi} className="space-y-4">
          <div>
            <Label htmlFor="builder-ai-prompt" className="mb-1.5">
              Prompt
            </Label>
            <Textarea
              id="builder-ai-prompt"
              rows={4}
              maxLength={10000}
              required
              value={aiPrompt}
              onChange={(event) => setAiPrompt(event.currentTarget.value)}
            />
          </div>
          <div>
            <Label htmlFor="builder-ai-doc" className="mb-1.5">
              Reference document (optional)
            </Label>
            <Select
              id="builder-ai-doc"
              value={aiDocId}
              onChange={(event) => setAiDocId(event.currentTarget.value)}
            >
              <option value="">No specific document</option>
              {readyDocuments.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.filename}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAiDialogOpen(false)}
              disabled={generatingAi}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={generatingAi || !aiPrompt.trim()}>
              <Wand2 className="h-4 w-4" aria-hidden="true" />
              {generatingAi ? "Generating..." : "Generate graph"}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Run Workflow Dialog */}
      <Dialog
        open={runDialogOpen}
        onClose={() => setRunDialogOpen(false)}
        title="Run workflow"
        description="Select a ready document to process with this workflow."
      >
        <form onSubmit={handleRunWorkflow} className="space-y-4">
          {readyDocuments.length === 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              No ready documents in this workspace yet. Upload a PDF, DOCX, or
              TXT in the Documents tab first.
            </p>
          ) : (
            <div>
              <Label htmlFor="run-doc-select" className="mb-1.5">
                Target document
              </Label>
              <Select
                id="run-doc-select"
                value={runDocId}
                onChange={(event) => setRunDocId(event.currentTarget.value)}
                required
              >
                <option value="">Choose a ready document</option>
                {readyDocuments.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.filename}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRunDialogOpen(false)}
              disabled={running}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={running || !runDocId || readyDocuments.length === 0}
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              {running ? "Starting..." : "Start execution"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

export function WorkflowBuilderView(props: WorkflowBuilderInnerProps) {
  return (
    <ReactFlowProvider>
      <WorkflowBuilderInner {...props} />
    </ReactFlowProvider>
  );
}


import { describe, expect, it, vi } from "vitest";
import type { WorkflowDefinition } from "@flowpilot/shared";
import {
  assertExecutionTransition,
  assertStepTransition,
  InvalidStateTransitionError,
} from "../src/workflow/state.js";
import { getNextExecutableNode } from "../src/workflow/runner.js";
import { getRetryDecision } from "../src/workflow/retry.js";
import { createToolRegistry, ToolAuthorizationError } from "../src/tools/registry.js";

const branchedGraph: WorkflowDefinition = {
  version: 1,
  nodes: [
    { id: "extract", kind: "extract_document", position: { x: 0, y: 0 }, config: {} },
    {
      id: "condition",
      kind: "condition",
      position: { x: 0, y: 100 },
      config: { field: "has_action_items", operator: "equals", value: true },
    },
    {
      id: "yes",
      kind: "create_report",
      position: { x: 100, y: 200 },
      config: { title: "Has items" },
    },
    {
      id: "no",
      kind: "create_report",
      position: { x: -100, y: 200 },
      config: { title: "No items" },
    },
  ],
  edges: [
    { id: "a", source: "extract", target: "condition" },
    { id: "b", source: "condition", target: "yes", branch: "true" },
    { id: "c", source: "condition", target: "no", branch: "false" },
  ],
};

describe("workflow execution foundation", () => {
  it("schedules the first node, then follows only the selected branch", () => {
    expect(
      getNextExecutableNode(branchedGraph, {
        completedNodeIds: new Set(),
        conditionResults: new Map(),
      })?.id,
    ).toBe("extract");

    expect(
      getNextExecutableNode(branchedGraph, {
        completedNodeIds: new Set(["extract"]),
        conditionResults: new Map(),
      })?.id,
    ).toBe("condition");

    expect(
      getNextExecutableNode(branchedGraph, {
        completedNodeIds: new Set(["extract", "condition"]),
        conditionResults: new Map([["condition", { hasActionItems: true }]]),
      })?.id,
    ).toBe("yes");
  });

  it("does not repeat completed steps and rejects missing condition results", () => {
    expect(
      getNextExecutableNode(branchedGraph, {
        completedNodeIds: new Set(["extract", "condition", "yes"]),
        conditionResults: new Map([["condition", { hasActionItems: true }]]),
      }),
    ).toBeNull();
    expect(() =>
      getNextExecutableNode(branchedGraph, {
        completedNodeIds: new Set(["extract", "condition"]),
        conditionResults: new Map(),
      }),
    ).toThrow(/unavailable/);
  });

  it("enforces persisted execution and step transition policies", () => {
    expect(() => assertExecutionTransition("queued", "running")).not.toThrow();
    expect(() => assertExecutionTransition("succeeded", "running")).toThrow(
      InvalidStateTransitionError,
    );
    expect(() => assertStepTransition("failed", "running")).not.toThrow();
    expect(() => assertStepTransition("succeeded", "running")).toThrow(
      InvalidStateTransitionError,
    );
  });

  it("retries only explicitly retryable transient work within a fixed bound", () => {
    expect(
      getRetryDecision(
        { failureKind: "transient", attemptNumber: 1, explicitlyRetryable: true },
        () => 1,
      ),
    ).toEqual({ retry: true, delayMs: 1_000 });
    expect(
      getRetryDecision({
        failureKind: "permanent",
        attemptNumber: 1,
        explicitlyRetryable: true,
      }),
    ).toEqual({ retry: false });
    expect(
      getRetryDecision({
        failureKind: "transient",
        attemptNumber: 3,
        explicitlyRetryable: true,
      }),
    ).toEqual({ retry: false });
  });

  it("blocks unapproved tools, unauthorized documents, and replacements without approval", async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    const registry = createToolRegistry(
      {
        extract_document: handler,
        analyze_document: handler,
        create_report: handler,
        replace_report: handler,
      },
      async () => true,
      async (_workspaceId, documentId) =>
        documentId === "00000000-0000-4000-8000-000000000001",
    );

    await expect(
      registry.execute(
        "unknown",
        {},
        {
          userId: "00000000-0000-4000-8000-000000000010",
          workspaceId: "00000000-0000-4000-8000-000000000020",
        },
      ),
    ).rejects.toBeInstanceOf(ToolAuthorizationError);
    await expect(
      registry.execute(
        "extract_document",
        { documentId: "00000000-0000-4000-8000-000000000002" },
        {
          userId: "00000000-0000-4000-8000-000000000010",
          workspaceId: "00000000-0000-4000-8000-000000000020",
        },
      ),
    ).rejects.toMatchObject({ code: "DOCUMENT_NOT_OWNED" });
    await expect(
      registry.execute(
        "replace_report",
        {
          reportId: "00000000-0000-4000-8000-000000000003",
          content: {},
        },
        {
          userId: "00000000-0000-4000-8000-000000000010",
          workspaceId: "00000000-0000-4000-8000-000000000020",
        },
      ),
    ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("blocks approved tools when the user does not own the workspace", async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    const registry = createToolRegistry(
      {
        extract_document: handler,
        analyze_document: handler,
        create_report: handler,
        replace_report: handler,
      },
      async () => false,
      async () => true,
    );

    await expect(
      registry.execute(
        "create_report",
        { title: "Report", content: {} },
        {
          userId: "00000000-0000-4000-8000-000000000010",
          workspaceId: "00000000-0000-4000-8000-000000000020",
        },
      ),
    ).rejects.toMatchObject({ code: "WORKSPACE_NOT_OWNED" });
    expect(handler).not.toHaveBeenCalled();
  });
});

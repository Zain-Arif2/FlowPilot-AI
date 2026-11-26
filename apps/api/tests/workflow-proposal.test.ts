import { describe, expect, it, vi } from "vitest";
import type { WorkflowProposal } from "@flowpilot/shared";
import {
  OpenRouterError,
  type StructuredRequest,
} from "../src/adapters/openrouter.js";
import { createWorkflowProposalService } from "../src/modules/workflows/proposal.js";

const validProposal: WorkflowProposal = {
  definition: {
    version: 1,
    nodes: [
      {
        id: "extract",
        kind: "extract_document",
        position: { x: 0, y: 0 },
        config: {},
      },
      {
        id: "analyze",
        kind: "analyze_document",
        position: { x: 0, y: 100 },
        config: { sections: ["summary", "dates", "action_items"] },
      },
      {
        id: "report",
        kind: "create_report",
        position: { x: 0, y: 200 },
        config: { title: "Document summary" },
      },
    ],
    edges: [
      { id: "extract-analyze", source: "extract", target: "analyze" },
      { id: "analyze-report", source: "analyze", target: "report" },
    ],
  },
  warnings: [],
};
const invalidProposal: WorkflowProposal = {
  ...validProposal,
  definition: {
    ...validProposal.definition,
    edges: [{ id: "cycle", source: "extract", target: "extract" }],
  },
};
const repeatedExtractProposal: WorkflowProposal = {
  definition: {
    version: 1,
    nodes: ["extract-1", "extract-2", "extract-3"].map((id, index) => ({
      id,
      kind: "extract_document" as const,
      position: { x: 0, y: index * 100 },
      config: {},
    })),
    edges: [
      { id: "extract-1-2", source: "extract-1", target: "extract-2" },
      { id: "extract-2-3", source: "extract-2", target: "extract-3" },
    ],
  },
  warnings: [],
};
const conditionalProposal: WorkflowProposal = {
  definition: {
    version: 1,
    nodes: [
      validProposal.definition.nodes[0]!,
      validProposal.definition.nodes[1]!,
      {
        id: "condition",
        kind: "condition",
        position: { x: 0, y: 200 },
        config: { field: "has_action_items", operator: "equals", value: true },
      },
      {
        id: "report-true",
        kind: "create_report",
        position: { x: -80, y: 300 },
        config: { title: "Action items found" },
      },
      {
        id: "report-false",
        kind: "create_report",
        position: { x: 80, y: 300 },
        config: { title: "No action items" },
      },
    ],
    edges: [
      { id: "extract-analyze", source: "extract", target: "analyze" },
      { id: "analyze-condition", source: "analyze", target: "condition" },
      {
        id: "condition-true",
        source: "condition",
        target: "report-true",
        branch: "true",
      },
      {
        id: "condition-false",
        source: "condition",
        target: "report-false",
        branch: "false",
      },
    ],
  },
  warnings: [],
};

function createService(responses: readonly WorkflowProposal[]) {
  let responseIndex = 0;
  const client = {
    async requestStructuredOutput<T>(request: StructuredRequest<T>): Promise<T> {
      const response = responses[responseIndex];
      responseIndex += 1;
      if (!response) throw new Error("Unexpected proposal retry.");
      return request.validator.parse(response);
    },
  };
  const requestStructuredOutput = vi.spyOn(client, "requestStructuredOutput");
  const service = createWorkflowProposalService(
    client,
    { findById: async () => null },
  );
  return { service, requestStructuredOutput };
}

describe("workflow proposal validation and repair", () => {
  it("makes one bounded repair request and returns the valid graph", async () => {
    const { service, requestStructuredOutput } = createService([
      invalidProposal,
      validProposal,
    ]);

    const proposal = await service.propose("owner", "workspace", {
      prompt: "Summarize the document.",
    });

    expect(proposal).toEqual(validProposal);
    expect(requestStructuredOutput).toHaveBeenCalledTimes(2);
    expect(requestStructuredOutput.mock.calls[1]?.[0].userPrompt).toContain(
      "Validation issues",
    );
  });

  it("rejects malformed proposals after the single allowed repair", async () => {
    const { service, requestStructuredOutput } = createService([
      invalidProposal,
      invalidProposal,
    ]);

    await expect(
      service.propose("owner", "workspace", { prompt: "Summarize the document." }),
    ).rejects.toMatchObject({
      status: 422,
      code: "INVALID_INPUT",
    });
    expect(requestStructuredOutput).toHaveBeenCalledTimes(2);
  });

  it("repairs duplicate extraction nodes and gives the model an explicit example", async () => {
    const { service, requestStructuredOutput } = createService([
      repeatedExtractProposal,
      validProposal,
    ]);

    const proposal = await service.propose("owner", "workspace", {
      prompt: "Summarize the document.",
    });

    expect(proposal).toEqual(validProposal);
    expect(requestStructuredOutput).toHaveBeenCalledTimes(2);
    const firstRequest = requestStructuredOutput.mock.calls[0]?.[0];
    expect(firstRequest?.systemPrompt).toContain(
      "extract_document, analyze_document, create_report, replace_report, and condition",
    );
    expect(firstRequest?.systemPrompt).toContain('"kind":"extract_document"');
    expect(requestStructuredOutput.mock.calls[1]?.[0].userPrompt).toContain(
      "exactly one extract_document step",
    );
  });

  it("rejects repeated extraction nodes after the single repair attempt", async () => {
    const { service, requestStructuredOutput } = createService([
      repeatedExtractProposal,
      repeatedExtractProposal,
    ]);

    await expect(
      service.propose("owner", "workspace", {
        prompt: "Summarize the document.",
      }),
    ).rejects.toMatchObject({
      status: 422,
      code: "INVALID_INPUT",
      message: "The AI workflow proposal failed step-order validation.",
    });
    expect(requestStructuredOutput).toHaveBeenCalledTimes(2);
  });

  it("keeps a structurally valid condition branch after document analysis", async () => {
    const { service, requestStructuredOutput } = createService([
      conditionalProposal,
    ]);

    const proposal = await service.propose("owner", "workspace", {
      prompt: "Summarize the document and branch on whether it has action items.",
    });

    expect(proposal).toEqual(conditionalProposal);
    expect(requestStructuredOutput).toHaveBeenCalledTimes(1);
  });

  it("returns a clear rate-limit response instead of generic provider unavailability", async () => {
    const client = {
      async requestStructuredOutput<T>(_request: StructuredRequest<T>): Promise<T> {
        throw new OpenRouterError("PROVIDER_RATE_LIMITED", 429, "RATE_LIMITED");
      },
    };
    const service = createWorkflowProposalService(client, {
      findById: async () => null,
    });

    await expect(
      service.propose("owner", "workspace", {
        prompt: "Summarize the document.",
      }),
    ).rejects.toMatchObject({
      status: 429,
      code: "RATE_LIMITED",
      message: "Workflow generation is rate-limited. Please try again shortly.",
    });
  });

  it("warns when the opted-in data-collection fallback was used", async () => {
    const client = {
      async requestStructuredOutput<T>(request: StructuredRequest<T>): Promise<T> {
        request.onDataCollectionFallback?.();
        return request.validator.parse(validProposal);
      },
    };
    const service = createWorkflowProposalService(client, {
      findById: async () => null,
    });

    const proposal = await service.propose("owner", "workspace", {
      prompt: "Summarize the document.",
    });

    expect(proposal.warnings).toContain(
      "This development request used OpenRouter data_collection=allow. Do not send sensitive data.",
    );
  });
});

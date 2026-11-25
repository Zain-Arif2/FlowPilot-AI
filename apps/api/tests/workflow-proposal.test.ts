import { describe, expect, it, vi } from "vitest";
import type { WorkflowProposal } from "@flowpilot/shared";
import type { StructuredRequest } from "../src/adapters/openrouter.js";
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
    ],
    edges: [],
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
});

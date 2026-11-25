import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createOpenRouterAdapter } from "../src/adapters/openrouter.js";

const apiKey = process.env.OPENROUTER_API_KEY ?? "";
const model = process.env.OPENROUTER_MODEL ?? "";
const runLiveTest =
  process.env.FLOWPILOT_LIVE_OPENROUTER_TEST === "true" &&
  Boolean(apiKey) &&
  !apiKey.startsWith("replace-") &&
  Boolean(model) &&
  !model.startsWith("replace-");

describe.skipIf(!runLiveTest)("live OpenRouter smoke test (opt-in)", () => {
  it("returns validated structured output using the configured OPENROUTER_MODEL", async () => {
    const adapter = createOpenRouterAdapter({
      apiKey,
      model,
      timeoutMs: Number(process.env.OPENROUTER_TIMEOUT_MS ?? "30000"),
    });

    const result = await adapter.requestStructuredOutput({
      schemaName: "flowpilot_smoke_test_v1",
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["status"],
        properties: {
          status: { type: "string", enum: ["ok"] },
        },
      },
      systemPrompt: "Return JSON matching the schema with status set to ok.",
      userPrompt: "Respond with ok.",
      validator: z.object({ status: z.literal("ok") }).strict(),
    });

    expect(result).toEqual({ status: "ok" });
  }, 30_000);
});


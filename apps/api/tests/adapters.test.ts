import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { readConfig } from "../src/config.js";
import {
  createPrivateObjectKey,
  mapObjectStorageError,
  ObjectStorageError,
} from "../src/adapters/object-storage.js";
import {
  createOpenRouterAdapter,
  OpenRouterError,
} from "../src/adapters/openrouter.js";
import { createRedactedLogger } from "../src/middleware/logger.js";

const config = {
  apiKey: "test-key",
  model: "test/model",
  timeoutMs: 1_000,
  baseUrl: "https://router.example",
};

describe("adapter boundaries", () => {
  it("rejects incomplete runtime configuration without echoing secret values", () => {
    expect(() => readConfig({ OPENROUTER_API_KEY: "sensitive-key" })).toThrow(
      /DATABASE_URL/,
    );
    try {
      readConfig({ OPENROUTER_API_KEY: "sensitive-key" });
    } catch (error) {
      expect(String(error)).not.toContain("sensitive-key");
    }
  });

  it("creates opaque, workspace-scoped storage keys without file names", () => {
    const first = createPrivateObjectKey(
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "source",
    );
    const second = createPrivateObjectKey(
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "source",
    );
    expect(first).toContain(
      "workspaces/00000000-0000-4000-8000-000000000001/documents/00000000-0000-4000-8000-000000000002/source/",
    );
    expect(first).not.toContain("original.pdf");
    expect(first).not.toBe(second);
    const mapped = mapObjectStorageError(new Error("secret storage credentials"));
    expect(mapped).toBeInstanceOf(ObjectStorageError);
    expect(mapped.message).not.toContain("secret storage credentials");
  });

  it("requests strict, privacy-restricted structured output and validates it", async () => {
    let requestBody: unknown;
    const fetcher: typeof fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as unknown;
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '{"summary":"done"}' } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const adapter = createOpenRouterAdapter(config, fetcher);
    const result = await adapter.requestStructuredOutput({
      schemaName: "summary",
      jsonSchema: { type: "object" },
      systemPrompt: "Summarize.",
      userPrompt: "Text",
      validator: z.object({ summary: z.string() }).strict(),
    });

    expect(result.summary).toBe("done");
    expect(requestBody).toMatchObject({
      model: config.model,
      response_format: {
        type: "json_schema",
        json_schema: { strict: true, name: "summary" },
      },
      provider: { require_parameters: true, data_collection: "deny", zdr: true },
    });
  });

  it("aborts and maps timeouts to PROVIDER_UNAVAILABLE", async () => {
    const timedOut = createOpenRouterAdapter(
      { ...config, timeoutMs: 10 },
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );

    await expect(
      timedOut.requestStructuredOutput({
        schemaName: "timeout_check",
        jsonSchema: { type: "object" },
        systemPrompt: "",
        userPrompt: "",
        validator: z.object({ ok: z.boolean() }),
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  it("maps provider and structured-output failures without exposing provider bodies", async () => {
    const unavailable = createOpenRouterAdapter(
      config,
      async () => new Response("private provider response", { status: 503 }),
    );
    await expect(
      unavailable.requestStructuredOutput({
        schemaName: "result",
        jsonSchema: {},
        systemPrompt: "",
        userPrompt: "",
        validator: z.object({ value: z.string() }),
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });

    const rateLimited = createOpenRouterAdapter(
      config,
      async () => new Response("private provider response", { status: 429 }),
    );
    await expect(
      rateLimited.requestStructuredOutput({
        schemaName: "result",
        jsonSchema: {},
        systemPrompt: "",
        userPrompt: "",
        validator: z.object({ value: z.string() }),
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });

    const invalid = createOpenRouterAdapter(
      config,
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"unexpected":true}' } }],
          }),
          { status: 200 },
        ),
    );
    await expect(
      invalid.requestStructuredOutput({
        schemaName: "result",
        jsonSchema: {},
        systemPrompt: "",
        userPrompt: "",
        validator: z.object({ value: z.string() }).strict(),
      }),
    ).rejects.toBeInstanceOf(OpenRouterError);
  });

  it("redacts sensitive values from structured logs", async () => {
    const stream = new PassThrough();
    let output = "";
    stream.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    const logger = createRedactedLogger(stream);
    logger.info(
      { password: "pass-secret", token: "token-secret", documentText: "private-doc" },
      "redaction-check",
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(output).not.toContain("pass-secret");
    expect(output).not.toContain("token-secret");
    expect(output).not.toContain("private-doc");
    expect(output).toContain("[REDACTED]");
    logger.flush();
  });
});

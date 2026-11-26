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
  assertOpenRouterPrivacySettings,
  createOpenRouterAdapter,
  OpenRouterError,
  parseOpenRouterAllowNonZdr,
  type OpenRouterConfig,
} from "../src/adapters/openrouter.js";
import { createRedactedLogger } from "../src/middleware/logger.js";

// OpenRouterConfig fixture used for adapter tests — does not include
// full AppConfig fields like DATABASE_URL that are irrelevant here.
const openRouterConfig: OpenRouterConfig = {
  apiKey: "test-key",
  model: "test/model",
  timeoutMs: 30_000,
};

const validEnvironment: NodeJS.ProcessEnv = {
  DATABASE_URL: "postgresql://app:pass@localhost:5432/flowpilot",
  MIGRATION_URL: "postgresql://migration:pass@localhost:5432/flowpilot",
  REDIS_URL: "redis://localhost:6379",
  CLOUDINARY_CLOUD_NAME: "test-cloud",
  CLOUDINARY_API_KEY: "test-key",
  CLOUDINARY_API_SECRET: "test-secret",
  OPENROUTER_API_KEY: "test-provider-key",
  OPENROUTER_MODEL: "provider/model:free",
  JWT_ACCESS_SECRET: "test-access-secret-at-least-32-chars-long",
  JWT_REFRESH_SECRET: "test-refresh-secret-at-least-32-chars-long",
  APP_ORIGIN: "http://localhost:3000",
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

  it("keeps OpenRouter privacy exceptions opt-in and development-only", () => {
    expect(parseOpenRouterAllowNonZdr(undefined)).toBe(false);
    expect(parseOpenRouterAllowNonZdr("false")).toBe(false);
    expect(parseOpenRouterAllowNonZdr("true")).toBe(true);
    expect(() => parseOpenRouterAllowNonZdr("yes")).toThrow(
      "OPENROUTER_ALLOW_NON_ZDR must be either true or false.",
    );
    expect(() =>
      assertOpenRouterPrivacySettings({
        model: "provider/model:free",
        allowNonZdr: true,
        nodeEnv: "production",
      }),
    ).toThrow(/development-only/);
    expect(() =>
      assertOpenRouterPrivacySettings({
        model: "provider/paid-model",
        allowNonZdr: true,
        nodeEnv: "development",
      }),
    ).toThrow(/:free model/);
    expect(() =>
      assertOpenRouterPrivacySettings({
        model: "provider/model:free",
        allowNonZdr: false,
        allowDataCollectionFallback: true,
        nodeEnv: "development",
      }),
    ).toThrow(/OPENROUTER_ALLOW_NON_ZDR=true/);
  });

  it("enforces privacy settings when reading API configuration", () => {
    const defaults = readConfig(validEnvironment);
    expect(defaults.OPENROUTER_ALLOW_NON_ZDR).toBe(false);
    expect(defaults.OPENROUTER_ALLOW_DATA_COLLECTION).toBe(false);

    expect(() =>
      readConfig({
        ...validEnvironment,
        OPENROUTER_ALLOW_NON_ZDR: "true",
        NODE_ENV: "production",
      }),
    ).toThrow(/development-only/);
    expect(() =>
      readConfig({
        ...validEnvironment,
        OPENROUTER_ALLOW_NON_ZDR: "true",
        OPENROUTER_MODEL: "provider/paid-model",
        NODE_ENV: "development",
      }),
    ).toThrow(/require OPENROUTER_MODEL to use a :free model/);
    expect(() =>
      readConfig({
        ...validEnvironment,
        OPENROUTER_ALLOW_DATA_COLLECTION: "true",
      }),
    ).toThrow(/OPENROUTER_ALLOW_DATA_COLLECTION requires OPENROUTER_ALLOW_NON_ZDR=true/);
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
    const adapter = createOpenRouterAdapter(openRouterConfig, fetcher);
    const result = await adapter.requestStructuredOutput({
      schemaName: "summary",
      jsonSchema: { type: "object" },
      systemPrompt: "Summarize.",
      userPrompt: "Text",
      validator: z.object({ summary: z.string() }).strict(),
    });

    expect(result.summary).toBe("done");
    expect(requestBody).toMatchObject({
      model: openRouterConfig.model,
      response_format: {
        type: "json_schema",
        json_schema: { strict: true, name: "summary" },
      },
      provider: { require_parameters: true, data_collection: "deny", zdr: true },
    });
  });

  it("aborts and maps timeouts to PROVIDER_UNAVAILABLE", async () => {
    const timedOut = createOpenRouterAdapter(
      { ...openRouterConfig, timeoutMs: 10 },
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
      openRouterConfig,
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

    let rateLimitedRequests = 0;
    const rateLimited = createOpenRouterAdapter(openRouterConfig, async () => {
      rateLimitedRequests += 1;
      return new Response("private provider response", { status: 429 });
    });
    await expect(
      rateLimited.requestStructuredOutput({
        schemaName: "result",
        jsonSchema: {},
        systemPrompt: "",
        userPrompt: "",
        validator: z.object({ value: z.string() }),
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_RATE_LIMITED",
      httpStatus: 429,
      providerReason: "RATE_LIMITED",
      message: "The AI provider could not complete this request.",
    });
    expect(rateLimitedRequests).toBe(2);

    const noEligibleEndpoint = createOpenRouterAdapter(
      openRouterConfig,
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: 404,
              message: "No endpoints found matching your data policy.",
            },
          }),
          { status: 404 },
        ),
    );
    await expect(
      noEligibleEndpoint.requestStructuredOutput({
        schemaName: "result",
        jsonSchema: {},
        systemPrompt: "",
        userPrompt: "",
        validator: z.object({ value: z.string() }),
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_REJECTED_REQUEST",
      httpStatus: 404,
      providerReason: "NO_ENDPOINTS_MATCHING_DATA_POLICY",
      message: "The AI provider could not complete this request.",
    });

    const invalid = createOpenRouterAdapter(
      openRouterConfig,
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

  it("retries 429 only once when the provider retry delay is short", async () => {
    let requestCount = 0;
    const adapter = createOpenRouterAdapter(openRouterConfig, async () => {
      requestCount += 1;
      if (requestCount === 1) {
        return new Response("rate limited", {
          status: 429,
          headers: { "Retry-After": "0" },
        });
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '{"value":"ok"}' } }] }),
        { status: 200 },
        );
    });

    await expect(
      adapter.requestStructuredOutput({
        schemaName: "result",
        jsonSchema: {},
        systemPrompt: "",
        userPrompt: "",
        validator: z.object({ value: z.string() }),
      }),
    ).resolves.toEqual({ value: "ok" });
    expect(requestCount).toBe(2);
  });

  it("uses allow only after an eligible-endpoint policy rejection in opted-in development", async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    let configFallbacks = 0;
    let requestFallbacks = 0;
    const adapter = createOpenRouterAdapter(
      {
        ...openRouterConfig,
        model: "provider/model:free",
        allowNonZdr: true,
        allowDataCollectionFallback: true,
        onDataCollectionFallback: () => {
          configFallbacks += 1;
        },
      },
      async (_input, init) => {
        requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        if (requestBodies.length === 1) {
          return new Response(
            JSON.stringify({
              error: {
                code: 404,
                message: "No endpoints found matching your data policy.",
              },
            }),
            { status: 404 },
          );
        }
        return new Response(
          JSON.stringify({ choices: [{ message: { content: '{"value":"ok"}' } }] }),
          { status: 200 },
        );
      },
    );

    await expect(
      adapter.requestStructuredOutput({
        schemaName: "result",
        jsonSchema: {},
        systemPrompt: "",
        userPrompt: "",
        validator: z.object({ value: z.string() }),
        onDataCollectionFallback: () => {
          requestFallbacks += 1;
        },
      }),
    ).resolves.toEqual({ value: "ok" });
    expect(requestBodies.map((body) => body.provider)).toEqual([
      { require_parameters: true, data_collection: "deny", zdr: false },
      { require_parameters: true, data_collection: "allow", zdr: false },
    ]);
    expect(configFallbacks).toBe(1);
    expect(requestFallbacks).toBe(1);
  });

  it("does not enable data collection when only the non-ZDR exception is enabled", async () => {
    let requestCount = 0;
    let requestBody: Record<string, unknown> | undefined;
    const adapter = createOpenRouterAdapter(
      {
        ...openRouterConfig,
        model: "provider/model:free",
        allowNonZdr: true,
        allowDataCollectionFallback: false,
      },
      async (_input, init) => {
        requestCount += 1;
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            error: {
              code: 404,
              message: "No endpoints found matching your data policy.",
            },
          }),
          { status: 404 },
        );
      },
    );

    await expect(
      adapter.requestStructuredOutput({
        schemaName: "result",
        jsonSchema: {},
        systemPrompt: "",
        userPrompt: "",
        validator: z.object({ value: z.string() }),
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_REJECTED_REQUEST",
      providerReason: "NO_ENDPOINTS_MATCHING_DATA_POLICY",
    });
    expect(requestCount).toBe(1);
    expect(requestBody?.provider).toEqual({
      require_parameters: true,
      data_collection: "deny",
      zdr: false,
    });
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

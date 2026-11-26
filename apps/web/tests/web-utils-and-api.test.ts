import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  ApiRequestError,
  apiRequest,
  apiRequestVoid,
  getErrorMessage,
} from "../src/lib/api.js";
import { cn, formatBytes, formatRelativeDate } from "../src/lib/utils.js";
import { getExecutionFailureMessage } from "../src/features/executions/failure-message.js";

describe("web utility helpers", () => {
  it("merges Tailwind classes cleanly", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });

  it("formats byte sizes consistently", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(1_572_864)).toBe("1.5 MB");
  });

  it("handles invalid dates gracefully", () => {
    expect(formatRelativeDate("not-a-date")).toBe("not-a-date");
    expect(formatRelativeDate("2026-11-25T12:00:00.000Z")).toBeTruthy();
  });

  it("explains rate-limited and otherwise failed execution steps", () => {
    expect(getExecutionFailureMessage("AI_PROVIDER_RATE_LIMITED")).toContain(
      "rate-limited",
    );
    expect(getExecutionFailureMessage("UNKNOWN_FAILURE")).toContain(
      "This step failed.",
    );
    expect(getExecutionFailureMessage(undefined)).toContain(
      "without an error code",
    );
  });
});

describe("API client helpers", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("parses valid JSON responses against the provided Zod schema", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await apiRequest("/healthz", z.object({ ok: z.boolean() }));
    expect(result).toEqual({ ok: true });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/v1/healthz",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
        cache: "no-store",
      }),
    );
  });

  it("maps structured API errors to ApiRequestError", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "CONFLICT",
            message: "Revision mismatch",
            requestId: "req-1",
          },
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      apiRequest("/workflows/1", z.object({ id: z.string() })),
    ).rejects.toMatchObject({
      name: "ApiRequestError",
      status: 409,
      code: "CONFLICT",
      message: "Revision mismatch",
    });
  });

  it.each([202, 204])("resolves void requests on %s with no content", async (status) => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status }));

    await expect(
      apiRequestVoid("/documents/1", { method: "DELETE" }),
    ).resolves.toBeUndefined();
  });

  it("preserves structured API errors for void requests", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "NOT_FOUND",
            message: "Document was not found.",
            requestId: "req-delete-1",
          },
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      apiRequestVoid("/workspaces/1/documents/1", { method: "DELETE" }),
    ).rejects.toMatchObject({
      name: "ApiRequestError",
      status: 404,
      code: "NOT_FOUND",
      message: "Document was not found.",
    });
  });

  it("returns safe user-facing error messages", () => {
    expect(
      getErrorMessage(new ApiRequestError(400, "BAD_REQUEST", "Invalid input")),
    ).toBe("Invalid input");
    expect(getErrorMessage(new Error("Internal stack"))).toBe(
      "The request could not be completed. Please try again.",
    );
  });
});


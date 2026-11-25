import { afterEach, describe, expect, it, vi } from "vitest";
import { UserSchema } from "@flowpilot/shared";
import { ApiRequestError, apiRequest } from "../src/lib/api.js";

describe("web API client JWT refresh handling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refreshes once on 401 and retries the original request with credentials", async () => {
    let meCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.credentials).toBe("include");
      const url = String(input);
      if (url === "/api/v1/auth/me") {
        meCalls += 1;
        if (meCalls === 1) {
          return new Response(
            JSON.stringify({
              error: {
                code: "UNAUTHENTICATED",
                message: "Sign-in is required.",
                requestId: "req-1",
              },
            }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            id: "00000000-0000-4000-8000-000000000001",
            email: "owner@example.com",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url === "/api/v1/auth/refresh") {
        expect(init?.method).toBe("POST");
        return new Response(
          JSON.stringify({
            id: "00000000-0000-4000-8000-000000000001",
            email: "owner@example.com",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`Unexpected URL ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = await apiRequest("/auth/me", UserSchema);
    expect(user.email).toBe("owner@example.com");
    expect(meCalls).toBe(2);
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url) === "/api/v1/auth/refresh"),
    ).toHaveLength(1);
  });

  it("deduplicates concurrent 401 responses into a single refresh request", async () => {
    let refreshed = false;
    let refreshCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/v1/auth/refresh") {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        refreshed = true;
        return new Response(
          JSON.stringify({
            id: "00000000-0000-4000-8000-000000000001",
            email: "owner@example.com",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (!refreshed) {
        return new Response(
          JSON.stringify({
            error: {
              code: "UNAUTHENTICATED",
              message: "Sign-in is required.",
              requestId: "req-1",
            },
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          id: "00000000-0000-4000-8000-000000000001",
          email: "owner@example.com",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await Promise.all([
      apiRequest("/auth/me", UserSchema),
      apiRequest("/auth/me", UserSchema),
      apiRequest("/auth/me", UserSchema),
    ]);

    expect(results).toHaveLength(3);
    expect(refreshCalls).toBe(1);
  });

  it("throws 401 ApiRequestError when refresh fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return new Response(
        JSON.stringify({
          error: {
            code: "UNAUTHENTICATED",
            message: "Sign-in is required.",
            requestId: url === "/api/v1/auth/refresh" ? "req-2" : "req-1",
          },
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest("/auth/me", UserSchema)).rejects.toBeInstanceOf(
      ApiRequestError,
    );
  });
});

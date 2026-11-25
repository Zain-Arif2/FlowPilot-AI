import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { getAuthCookieNames, readConfig } from "../src/config.js";
import { errorHandler } from "../src/middleware/error.js";
import { requestContext } from "../src/middleware/request-context.js";
import { createCsrfProtection } from "../src/middleware/csrf.js";
import {
  authCookieOptions,
  createJwtAuthentication,
} from "../src/middleware/auth.js";
import { createWorkspaceAuthorization } from "../src/middleware/workspace.js";

function createSecurityTestApp(
  verifyAccessToken: (token: string) => { id: string; email: string } | null,
  verifyWorkspace: (context: {
    userId: string;
    workspaceId: string;
  }) => Promise<boolean>,
) {
  const app = express();
  const router = express.Router();
  router.use(createCsrfProtection("http://localhost:3000"));
  router.use(createJwtAuthentication(verifyAccessToken, "flowpilot_access"));
  router.post(
    "/workspaces/:workspaceId/action",
    createWorkspaceAuthorization(verifyWorkspace),
    (_request, response) => response.status(204).end(),
  );
  app.use(requestContext);
  app.use("/api/v1", router);
  app.use(errorHandler);
  return app;
}

describe("API security middleware", () => {
  it("serves health with a server-generated request ID", async () => {
    const app = createApp(
      readConfig({
        DATABASE_URL: "postgresql://app:pass@localhost:5432/flowpilot",
        MIGRATION_URL: "postgresql://migration:pass@localhost:5432/flowpilot",
        REDIS_URL: "redis://localhost:6379",
        OBJECT_STORAGE_ENDPOINT: "http://localhost:9000",
        OBJECT_STORAGE_REGION: "us-east-1",
        OBJECT_STORAGE_BUCKET: "private",
        OBJECT_STORAGE_ACCESS_KEY: "local-key",
        OBJECT_STORAGE_SECRET_KEY: "local-secret",
        OPENROUTER_API_KEY: "local-key",
        OPENROUTER_MODEL: "approved/model",
        JWT_ACCESS_SECRET: "test-access-secret-at-least-32-chars-long",
        JWT_REFRESH_SECRET: "test-refresh-secret-at-least-32-chars-long",
        APP_ORIGIN: "http://localhost:3000",
      }),
    );
    const response = await request(app)
      .get("/api/v1/healthz")
      .set("X-Request-Id", "untrusted-client-value")
      .expect(200);
    expect(response.body).toEqual({ status: "ok" });
    expect(response.headers["x-request-id"]).not.toBe("untrusted-client-value");
  });

  it("denies unauthenticated workspace actions without revealing resources", async () => {
    const app = createSecurityTestApp(
      () => null,
      async () => true,
    );
    const response = await request(app)
      .post("/api/v1/workspaces/00000000-0000-4000-8000-000000000001/action")
      .set("Origin", "http://localhost:3000")
      .expect(401);

    expect(response.body.error.code).toBe("UNAUTHENTICATED");
    expect(response.body.error.requestId).toBeTruthy();
  });

  it("returns the same not-found response for a workspace not owned by the user", async () => {
    const app = createSecurityTestApp(
      () => ({ id: "user-1", email: "u@example.com" }),
      async () => false,
    );
    const response = await request(app)
      .post("/api/v1/workspaces/00000000-0000-4000-8000-000000000001/action")
      .set("Origin", "http://localhost:3000")
      .set("Cookie", "flowpilot_access=valid-jwt")
      .expect(404);

    expect(response.body.error.code).toBe("NOT_FOUND");
    expect(JSON.stringify(response.body)).not.toContain("valid-jwt");
  });

  it("rejects cross-origin cookie-authenticated mutations", async () => {
    const app = createSecurityTestApp(
      () => ({ id: "user-1", email: "u@example.com" }),
      async () => true,
    );
    await request(app)
      .post("/api/v1/workspaces/00000000-0000-4000-8000-000000000001/action")
      .set("Origin", "https://attacker.example")
      .set("Cookie", "flowpilot_access=valid-jwt")
      .expect(403);
  });

  it("passes the access JWT cookie directly to the verifier", async () => {
    const verifier = vi.fn(() => null);
    const app = createSecurityTestApp(verifier, async () => true);
    await request(app)
      .post("/api/v1/workspaces/00000000-0000-4000-8000-000000000001/action")
      .set("Origin", "http://localhost:3000")
      .set("Cookie", "flowpilot_access=jwt.payload.sig")
      .expect(401);

    expect(verifier).toHaveBeenCalledWith("jwt.payload.sig");
  });

  it("uses __Host- prefixes in production and restrictive cookie defaults", () => {
    expect(getAuthCookieNames(true)).toEqual({
      accessCookieName: "__Host-flowpilot_access",
      refreshCookieName: "__Host-flowpilot_refresh",
    });
    expect(getAuthCookieNames(false)).toEqual({
      accessCookieName: "flowpilot_access",
      refreshCookieName: "flowpilot_refresh",
    });
    expect(authCookieOptions(true, 900)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 900_000,
    });
  });
});

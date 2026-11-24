import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { errorHandler } from "../src/middleware/error.js";
import { requestContext } from "../src/middleware/request-context.js";
import { createCsrfProtection } from "../src/middleware/csrf.js";
import {
  createSessionAuthentication,
  hashSessionToken,
  sessionCookieOptions,
} from "../src/middleware/session.js";
import { createWorkspaceAuthorization } from "../src/middleware/workspace.js";

function createSecurityTestApp(
  resolveSession: (token: string) => Promise<{ id: string; email: string } | null>,
  verifyWorkspace: (context: {
    userId: string;
    workspaceId: string;
  }) => Promise<boolean>,
) {
  const app = express();
  const router = express.Router();
  router.use(createCsrfProtection("http://localhost:3000"));
  router.use(createSessionAuthentication(resolveSession, "session"));
  router.post(
    "/workspaces/:workspaceId/action",
    createWorkspaceAuthorization(verifyWorkspace),
    (request, response) => response.status(204).end(),
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
      async () => null,
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
      async () => ({ id: "user-1", email: "u@example.com" }),
      async () => false,
    );
    const response = await request(app)
      .post("/api/v1/workspaces/00000000-0000-4000-8000-000000000001/action")
      .set("Origin", "http://localhost:3000")
      .set("Cookie", "session=valid-token")
      .expect(404);

    expect(response.body.error.code).toBe("NOT_FOUND");
    expect(JSON.stringify(response.body)).not.toContain("valid-token");
  });

  it("rejects cross-origin cookie-authenticated mutations", async () => {
    const app = createSecurityTestApp(
      async () => ({ id: "user-1", email: "u@example.com" }),
      async () => true,
    );
    await request(app)
      .post("/api/v1/workspaces/00000000-0000-4000-8000-000000000001/action")
      .set("Origin", "https://attacker.example")
      .set("Cookie", "session=valid-token")
      .expect(403);
  });

  it("hashes opaque session credentials before database lookup", async () => {
    const resolver = vi.fn(async () => null);
    const app = createSecurityTestApp(resolver, async () => true);
    await request(app)
      .post("/api/v1/workspaces/00000000-0000-4000-8000-000000000001/action")
      .set("Origin", "http://localhost:3000")
      .set("Cookie", "session=opaque-token")
      .expect(401);

    expect(hashSessionToken("opaque-token")).not.toBe("opaque-token");
    expect(resolver).toHaveBeenCalledWith(hashSessionToken("opaque-token"));
  });

  it("sets session cookies with restrictive defaults", () => {
    expect(sessionCookieOptions(true)).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
  });
});

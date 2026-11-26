import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../src/config.js";
import { HttpError } from "../src/errors/api-error.js";
import { createApp } from "../src/app.js";

const config = {
  DATABASE_URL: "postgresql://app:pass@localhost:5432/flowpilot",
  MIGRATION_URL: "postgresql://migration:pass@localhost:5432/flowpilot",
  REDIS_URL: "redis://localhost:6379",
  CLOUDINARY_CLOUD_NAME: "test-cloud",
  CLOUDINARY_API_KEY: "test-key",
  CLOUDINARY_API_SECRET: "test-secret",
  CLOUDINARY_SIGNED_URL_TTL_SECONDS: 300,
  DOCUMENT_MAX_BYTES: 4_000_000,
  OPENROUTER_API_KEY: "local-key",
  OPENROUTER_MODEL: "approved/model",
  OPENROUTER_TIMEOUT_MS: 30_000,
  JWT_ACCESS_SECRET: "test-access-secret-at-least-32-chars-long",
  JWT_REFRESH_SECRET: "test-refresh-secret-at-least-32-chars-long",
  JWT_ISSUER: "flowpilot-api",
  JWT_AUDIENCE: "flowpilot-web",
  JWT_ACCESS_TTL_SECONDS: 900,
  JWT_REFRESH_TTL_SECONDS: 604_800,
  COOKIE_SECURE: true,
  APP_ORIGIN: "https://flowpilot.example",
  API_PORT: 3001,
  API_BODY_LIMIT: "1mb",
  API_INTERNAL_URL: "http://localhost:3001",
} satisfies AppConfig;

const owner = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "owner@example.com",
};
const otherUser = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "other@example.com",
};
const workspaceId = "00000000-0000-4000-8000-000000000011";
const otherWorkspaceId = "00000000-0000-4000-8000-000000000012";
const executionId = "00000000-0000-4000-8000-000000000021";
const failedExecution = {
  id: executionId,
  workflowId: "00000000-0000-4000-8000-000000000031",
  status: "failed" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  errorCode: "DEPENDENCY_UNAVAILABLE",
};

function createTestApp() {
  const usersByToken = new Map([
    ["owner-session", owner],
    ["other-session", otherUser],
  ]);
  const workspaceOwners = new Map([
    [workspaceId, owner.id],
    [otherWorkspaceId, otherUser.id],
  ]);
  const executions = {
    async start() {
      return failedExecution;
    },
    async list() {
      return [failedExecution];
    },
    async get(_userId: string, requestedWorkspaceId: string) {
      return requestedWorkspaceId === workspaceId
        ? {
            ...failedExecution,
            steps: [
              {
                stepId: "analyze",
                actionType: "analyze_document" as const,
                status: "failed" as const,
                errorCode: "DEPENDENCY_UNAVAILABLE",
                attempts: [
                  {
                    attemptNumber: 1,
                    status: "failed" as const,
                    startedAt: "2026-01-01T00:00:00.000Z",
                    finishedAt: "2026-01-01T00:00:01.000Z",
                    errorCode: "DEPENDENCY_UNAVAILABLE",
                  },
                ],
              },
            ],
            events: [
              {
                eventType: "execution_step.state_changed",
                stepId: "analyze",
                details: {
                  state: "failed",
                  errorCode: "DEPENDENCY_UNAVAILABLE",
                  attemptNumber: 1,
                },
                createdAt: "2026-01-01T00:00:01.000Z",
              },
            ],
          }
        : null;
    },
    async retry() {
      return { ...failedExecution, status: "queued" as const, errorCode: undefined };
    },
  };
  const app = createApp(config, {
    auth: {
      async register() {
        return { user: owner, accessToken: "owner-session", refreshToken: "owner-refresh" };
      },
      async login() {
        return { user: owner, accessToken: "owner-session", refreshToken: "owner-refresh" };
      },
      async refresh() {
        return { user: owner, accessToken: "owner-session", refreshToken: "owner-refresh" };
      },
      verifyAccessToken(token: string) {
        return usersByToken.get(token) ?? null;
      },
      async logout() {},
    },
    workspaces: {
      async list() {
        return [];
      },
      async create() {
        throw new Error("Not used by this test.");
      },
      async rename() {
        return null;
      },
      async verifyOwner(userId: string, requestedWorkspaceId: string) {
        return workspaceOwners.get(requestedWorkspaceId) === userId;
      },
    },
    executions,
  });
  return { app, executions };
}

describe("execution history API contract", () => {
  it("returns workspace execution summaries and sanitized step/event details", async () => {
    const { app } = createTestApp();
    const history = await request(app)
      .get(`/api/v1/workspaces/${workspaceId}/executions`)
      .set("Cookie", "__Host-flowpilot_access=owner-session")
      .expect(200);
    expect(history.body).toEqual([failedExecution]);

    const detail = await request(app)
      .get(`/api/v1/workspaces/${workspaceId}/executions/${executionId}`)
      .set("Cookie", "__Host-flowpilot_access=owner-session")
      .expect(200);
    expect(detail.body.steps[0]).toMatchObject({
      stepId: "analyze",
      status: "failed",
      errorCode: "DEPENDENCY_UNAVAILABLE",
      attempts: [{ attemptNumber: 1, status: "failed" }],
    });
    expect(detail.body.events[0].details).toEqual({
      state: "failed",
      errorCode: "DEPENDENCY_UNAVAILABLE",
      attemptNumber: 1,
    });
    expect(JSON.stringify(detail.body)).not.toContain("prompt");
  });

  it("does not retrieve execution details from another workspace", async () => {
    const { app, executions } = createTestApp();
    const get = vi.spyOn(executions, "get");
    const response = await request(app)
      .get(`/api/v1/workspaces/${workspaceId}/executions/${executionId}`)
      .set("Cookie", "__Host-flowpilot_access=other-session")
      .expect(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
    expect(get).not.toHaveBeenCalled();
  });

  it("queues a workspace-authorized retry for the requested step", async () => {
    const { app, executions } = createTestApp();
    const retry = vi.spyOn(executions, "retry");
    const response = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/executions/${executionId}/retry`)
      .set("Cookie", "__Host-flowpilot_access=owner-session")
      .set("Origin", config.APP_ORIGIN)
      .send({ stepId: "analyze" })
      .expect(202);

    expect(response.body.status).toBe("queued");
    expect(retry).toHaveBeenCalledWith(owner.id, workspaceId, executionId, {
      stepId: "analyze",
    });
  });

  it("returns a conflict when the step is permanently failed", async () => {
    const { app, executions } = createTestApp();
    vi.spyOn(executions, "retry").mockRejectedValue(
      new HttpError(409, "CONFLICT", "This failed step is not eligible for a safe retry."),
    );
    const response = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/executions/${executionId}/retry`)
      .set("Cookie", "__Host-flowpilot_access=owner-session")
      .set("Origin", config.APP_ORIGIN)
      .send({ stepId: "create-report" })
      .expect(409);
    expect(response.body.error.code).toBe("CONFLICT");
  });
});

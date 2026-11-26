import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../src/config.js";
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
const attacker = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "attacker@example.com",
};
const workspaceId = "00000000-0000-4000-8000-000000000011";
const workflowId = "00000000-0000-4000-8000-000000000021";
const resourceId = "00000000-0000-4000-8000-000000000031";

function createTestApp() {
  const tokens = new Map([
    ["owner-session", owner],
    ["attacker-session", attacker],
  ]);
  const spies = {
    documents: {
      list: vi.fn(async () => {
        throw new Error("Unauthorized document service call.");
      }),
      createUploadIntent: vi.fn(async () => {
        throw new Error("Unauthorized document service call.");
      }),
      uploadDocument: vi.fn(async () => {
        throw new Error("Unauthorized document service call.");
      }),
      completeUpload: vi.fn(async () => {
        throw new Error("Unauthorized document service call.");
      }),
      requestDeletion: vi.fn(async () => {
        throw new Error("Unauthorized document service call.");
      }),
    },
    workflows: {
      propose: vi.fn(async () => {
        throw new Error("Unauthorized workflow service call.");
      }),
      list: vi.fn(async () => {
        throw new Error("Unauthorized workflow service call.");
      }),
      create: vi.fn(async () => {
        throw new Error("Unauthorized workflow service call.");
      }),
      get: vi.fn(async () => {
        throw new Error("Unauthorized workflow service call.");
      }),
      update: vi.fn(async () => {
        throw new Error("Unauthorized workflow service call.");
      }),
    },
    executions: {
      start: vi.fn(async () => {
        throw new Error("Unauthorized execution service call.");
      }),
      list: vi.fn(async () => {
        throw new Error("Unauthorized execution service call.");
      }),
      get: vi.fn(async () => {
        throw new Error("Unauthorized execution service call.");
      }),
      retry: vi.fn(async () => {
        throw new Error("Unauthorized execution service call.");
      }),
    },
    reports: {
      list: vi.fn(async () => {
        throw new Error("Unauthorized report service call.");
      }),
      get: vi.fn(async () => {
        throw new Error("Unauthorized report service call.");
      }),
    },
    approvals: {
      list: vi.fn(async () => {
        throw new Error("Unauthorized approval service call.");
      }),
      get: vi.fn(async () => {
        throw new Error("Unauthorized approval service call.");
      }),
      decide: vi.fn(async () => {
        throw new Error("Unauthorized approval service call.");
      }),
    },
  };
  const app = createApp(config, {
    auth: {
      async register() {
        throw new Error("Not used by this test.");
      },
      async login() {
        throw new Error("Not used by this test.");
      },
      async refresh() {
        return null;
      },
      verifyAccessToken(token: string) {
        return tokens.get(token) ?? null;
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
        return userId === owner.id && requestedWorkspaceId === workspaceId;
      },
    },
    ...spies,
  });
  return { app, spies };
}

describe("workspace isolation across resource endpoints", () => {
  it("denies cross-owner access before any document, workflow, execution, report, or approval service call", async () => {
    const { app, spies } = createTestApp();
    const endpoints = [
      ["GET", `/workspaces/${workspaceId}/documents`],
      ["POST", `/workspaces/${workspaceId}/documents`],
      ["POST", `/workspaces/${workspaceId}/documents/${resourceId}/complete`],
      ["DELETE", `/workspaces/${workspaceId}/documents/${resourceId}`],
      ["POST", `/workspaces/${workspaceId}/workflow-proposals`],
      ["GET", `/workspaces/${workspaceId}/workflows`],
      ["POST", `/workspaces/${workspaceId}/workflows`],
      ["GET", `/workspaces/${workspaceId}/workflows/${workflowId}`],
      ["PUT", `/workspaces/${workspaceId}/workflows/${workflowId}`],
      ["POST", `/workspaces/${workspaceId}/workflows/${workflowId}/executions`],
      ["GET", `/workspaces/${workspaceId}/executions`],
      ["GET", `/workspaces/${workspaceId}/executions/${resourceId}`],
      ["POST", `/workspaces/${workspaceId}/executions/${resourceId}/retry`],
      ["GET", `/workspaces/${workspaceId}/reports`],
      ["GET", `/workspaces/${workspaceId}/reports/${resourceId}`],
      ["GET", `/workspaces/${workspaceId}/approvals`],
      ["GET", `/workspaces/${workspaceId}/approvals/${resourceId}`],
      ["POST", `/workspaces/${workspaceId}/approvals/${resourceId}/decision`],
    ] as const;

    for (const [method, path] of endpoints) {
      const base = request(app);
      const call =
        method === "GET"
          ? base.get(`/api/v1${path}`)
          : method === "POST"
            ? base.post(`/api/v1${path}`)
            : method === "PUT"
              ? base.put(`/api/v1${path}`)
              : base.delete(`/api/v1${path}`);
      const response = await call
        .set("Cookie", "__Host-flowpilot_access=attacker-session")
        .set("Origin", config.APP_ORIGIN)
        .send({});
      expect(response.status, `${method} ${path}`).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    }

    for (const category of Object.values(spies)) {
      for (const method of Object.values(category)) {
        expect(method).not.toHaveBeenCalled();
      }
    }
  });
});

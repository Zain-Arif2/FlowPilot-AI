import request from "supertest";
import { describe, expect, it } from "vitest";
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
  DOCUMENT_MAX_BYTES: 10_000_000,
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
const workspaceId = "00000000-0000-4000-8000-000000000011";
const workflowId = "00000000-0000-4000-8000-000000000021";
const documentId = "00000000-0000-4000-8000-000000000031";
const executionId = "00000000-0000-4000-8000-000000000041";
const reportId = "00000000-0000-4000-8000-000000000051";
const definition = {
  version: 1 as const,
  nodes: [
    {
      id: "extract",
      kind: "extract_document" as const,
      position: { x: 0, y: 0 },
      config: {},
    },
  ],
  edges: [],
};
const workflow = {
  id: workflowId,
  name: "Extract document",
  revision: 1,
  definition,
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const document = {
  id: documentId,
  status: "uploading" as const,
  filename: "contract.pdf",
  mediaType: "application/pdf" as const,
  byteSize: 1024,
  createdAt: "2026-01-01T00:00:00.000Z",
};
const execution = {
  id: executionId,
  workflowId,
  status: "queued" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
};
const report = {
  id: reportId,
  title: "Contract summary",
  revision: 1,
  content: { summary: "A short summary." },
  createdAt: "2026-01-01T00:00:00.000Z",
};

function createTestApp() {
  const app = createApp(config, {
    auth: {
      async register() {
        return {
          user: owner,
          accessToken: "owner-session",
          refreshToken: "owner-refresh",
        };
      },
      async login() {
        return {
          user: owner,
          accessToken: "owner-session",
          refreshToken: "owner-refresh",
        };
      },
      async refresh() {
        return {
          user: owner,
          accessToken: "owner-session",
          refreshToken: "owner-refresh",
        };
      },
      verifyAccessToken(token: string) {
        return token === "owner-session" ? owner : null;
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
      async verifyOwner(_userId: string, requestedWorkspaceId: string) {
        return requestedWorkspaceId === workspaceId;
      },
    },
    documents: {
      async list() {
        return [document];
      },
      async createUploadIntent() {
        return {
          document,
          uploadUrl: "https://storage.example/upload",
          expiresAt: "2026-01-01T00:05:00.000Z",
          maxUploadBytes: 10_000_000,
        };
      },
      async uploadDocument() {
        return { ...document, status: "validating" as const };
      },
      async completeUpload() {
        return { ...document, status: "validating" as const };
      },
      async requestDeletion() {},
    },
    workflows: {
      async propose() {
        return { definition, warnings: [] };
      },
      async list() {
        return [workflow];
      },
      async create() {
        return workflow;
      },
      async get() {
        return workflow;
      },
      async update() {
        return { ...workflow, revision: 2 };
      },
    },
    executions: {
      async start() {
        return execution;
      },
      async list() {
        return [execution];
      },
      async get() {
        return null;
      },
      async retry() {
        return execution;
      },
    },
    reports: {
      async list() {
        return [report];
      },
      async get() {
        return report;
      },
    },
  });
  return app;
}

describe("authenticated document workflow API contracts", () => {
  it("supports upload, workflow proposal/save, execution, and report retrieval", async () => {
    const app = createTestApp();
    const auth = (call: request.Test) =>
      call
        .set("Cookie", "__Host-flowpilot_access=owner-session")
        .set("Origin", config.APP_ORIGIN);

    const upload = await auth(
      request(app).post(`/api/v1/workspaces/${workspaceId}/documents`),
    )
      .send({
        filename: "contract.pdf",
        mediaType: "application/pdf",
        byteSize: 1024,
      })
      .expect(201);
    expect(upload.body.document.id).toBe(documentId);
    expect(upload.body.uploadUrl).toContain("storage.example");

    const proposal = await auth(
      request(app).post(`/api/v1/workspaces/${workspaceId}/workflow-proposals`),
    )
      .send({ prompt: "Extract and summarize this document.", documentId })
      .expect(200);
    expect(proposal.body.definition.nodes[0].kind).toBe("extract_document");

    const saved = await auth(
      request(app).post(`/api/v1/workspaces/${workspaceId}/workflows`),
    )
      .send({ name: workflow.name, definition })
      .expect(201);
    expect(saved.body).toMatchObject({ id: workflowId, revision: 1 });

    const run = await auth(
      request(app).post(
        `/api/v1/workspaces/${workspaceId}/workflows/${workflowId}/executions`,
      ),
    )
      .set("Idempotency-Key", "document-run-request-0001")
      .send({ workflowRevision: 1, documentId })
      .expect(202);
    expect(run.body).toMatchObject({ id: executionId, status: "queued" });

    const reports = await auth(
      request(app).get(`/api/v1/workspaces/${workspaceId}/reports`),
    ).expect(200);
    expect(reports.body).toEqual([report]);
    const fetched = await auth(
      request(app).get(`/api/v1/workspaces/${workspaceId}/reports/${reportId}`),
    ).expect(200);
    expect(fetched.body.content.summary).toBe("A short summary.");
    expect(fetched.body.createdAt).toBe(report.createdAt);
  });
});

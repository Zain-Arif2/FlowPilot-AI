import request from "supertest";
import { describe, expect, it } from "vitest";
import type { WorkflowRepository } from "@flowpilot/db/repositories";
import type { WorkflowDefinition } from "@flowpilot/shared";
import type { AppConfig } from "../src/config.js";
import { createApp } from "../src/app.js";
import { createWorkflowService } from "../src/modules/workflows/service.js";

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
const workspaceId = "00000000-0000-4000-8000-000000000011";
const workflowId = "00000000-0000-4000-8000-000000000021";
const token = "workflow-owner-session";
const definition: WorkflowDefinition = {
  version: 1,
  nodes: [
    { id: "extract", kind: "extract_document", position: { x: 0, y: 0 }, config: {} },
  ],
  edges: [],
};

function createTestApp() {
  let saved: {
    id: string;
    name: string;
    revision: number;
    definition: WorkflowDefinition;
    updatedAt: Date;
  } | null = null;
  const repository = {
    async list() {
      return saved ? [saved] : [];
    },
    async findById() {
      return saved;
    },
    async create(
      _context: unknown,
      input: {
        readonly name: string;
        readonly definition: WorkflowDefinition;
      },
    ) {
      saved = {
        id: workflowId,
        name: input.name,
        revision: 1,
        definition: input.definition,
        updatedAt: new Date(),
      };
      return saved;
    },
    async update(
      _context: unknown,
      _id: string,
      expectedRevision: number,
      input: {
        readonly name: string;
        readonly definition: WorkflowDefinition;
      },
    ) {
      if (!saved || saved.revision !== expectedRevision) return null;
      saved = {
        ...saved,
        name: input.name,
        definition: input.definition,
        revision: saved.revision + 1,
        updatedAt: new Date(),
      };
      return saved;
    },
  } as unknown as WorkflowRepository;
  const workflowService = createWorkflowService(repository, {
    async propose() {
      throw new Error("Proposal generation is not used by this test.");
    },
  });
  const app = createApp(config, {
    auth: {
      async register() {
        return { user: owner, accessToken: token, refreshToken: "owner-refresh" };
      },
      async login() {
        return { user: owner, accessToken: token, refreshToken: "owner-refresh" };
      },
      async refresh() {
        return { user: owner, accessToken: token, refreshToken: "owner-refresh" };
      },
      verifyAccessToken(rawToken: string) {
        return rawToken === token ? owner : null;
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
    workflows: workflowService,
  });
  return { app };
}

describe("workflow API contract", () => {
  it("rejects malformed graph definitions before they can be saved", async () => {
    const { app } = createTestApp();
    const response = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/workflows`)
      .set("Cookie", `__Host-flowpilot_access=${token}`)
      .set("Origin", config.APP_ORIGIN)
      .send({
        name: "Cycle",
        definition: {
          ...definition,
          edges: [{ id: "self", source: "extract", target: "extract" }],
        },
      })
      .expect(422);

    expect(response.body.error.code).toBe("INVALID_INPUT");
  });

  it("rejects saves based on a stale If-Match workflow revision", async () => {
    const { app } = createTestApp();
    await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/workflows`)
      .set("Cookie", `__Host-flowpilot_access=${token}`)
      .set("Origin", config.APP_ORIGIN)
      .send({ name: "Initial", definition })
      .expect(201);

    const response = await request(app)
      .put(`/api/v1/workspaces/${workspaceId}/workflows/${workflowId}`)
      .set("Cookie", `__Host-flowpilot_access=${token}`)
      .set("Origin", config.APP_ORIGIN)
      .set("If-Match", '"workflow-9"')
      .send({ name: "Stale edit", definition })
      .expect(409);

    expect(response.body.error.code).toBe("CONFLICT");
  });
});

import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import type {
  AuthService,
  WorkspaceService,
} from "../src/services/contracts.js";

const config = readConfig({
  DATABASE_URL: "postgresql://app:pass@localhost:5432/flowpilot",
  MIGRATION_URL: "postgresql://migration:pass@localhost:5432/flowpilot",
  REDIS_URL: "redis://localhost:6379",
  OBJECT_STORAGE_ENDPOINT: "https://objects.example",
  OBJECT_STORAGE_REGION: "us-east-1",
  OBJECT_STORAGE_BUCKET: "private",
  OBJECT_STORAGE_ACCESS_KEY: "local-key",
  OBJECT_STORAGE_SECRET_KEY: "local-secret",
  OPENROUTER_API_KEY: "local-key",
  OPENROUTER_MODEL: "approved/model",
  JWT_ACCESS_SECRET: "test-access-secret-at-least-32-chars-long",
  JWT_REFRESH_SECRET: "test-refresh-secret-at-least-32-chars-long",
  APP_ORIGIN: "http://localhost:3000",
});

const auth: AuthService = {
  async register() {
    throw new Error("Not used by this test.");
  },
  async login() {
    throw new Error("Not used by this test.");
  },
  async refresh() {
    return null;
  },
  verifyAccessToken() {
    return null;
  },
  async logout() {},
};

const workspaces: WorkspaceService = {
  async list() {
    return [];
  },
  async create() {
    throw new Error("Not used by this test.");
  },
  async rename() {
    return null;
  },
  async verifyOwner() {
    return false;
  },
};

describe("API readiness endpoint", () => {
  it("reports ready only after the dependency check succeeds", async () => {
    const checkReadiness = vi.fn(async () => {});
    const app = createApp(config, { auth, workspaces, checkReadiness });

    const response = await request(app).get("/api/v1/readyz").expect(200);

    expect(response.body).toEqual({ status: "ready" });
    expect(checkReadiness).toHaveBeenCalledOnce();
  });

  it("returns a generic unavailable response when a dependency check fails", async () => {
    const app = createApp(config, {
      auth,
      workspaces,
      async checkReadiness() {
        throw new Error("Private dependency detail.");
      },
    });

    const response = await request(app).get("/api/v1/readyz").expect(503);

    expect(response.body).toEqual({ status: "not_ready" });
    expect(JSON.stringify(response.body)).not.toContain("Private dependency detail");
  });
});

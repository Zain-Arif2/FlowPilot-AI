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
const otherUser = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "other@example.com",
};
const workspaceId = "00000000-0000-4000-8000-000000000011";
const otherWorkspaceId = "00000000-0000-4000-8000-000000000012";
const approvalId = "00000000-0000-4000-8000-000000000021";
const executionId = "00000000-0000-4000-8000-000000000031";
const reportId = "00000000-0000-4000-8000-000000000041";
const proposedContent = {
  summary: "Review the contract.",
  dates: ["2026-12-01"],
  actionItems: ["Sign the contract."],
};

const approval = {
  id: approvalId,
  workspaceId,
  executionId,
  actionType: "replace_report" as const,
  targetReportId: reportId,
  expectedReportRevision: 3,
  status: "pending" as const,
  requestedAt: "2026-01-01T00:00:00.000Z",
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
  const approvals = {
    async list() {
      return [approval];
    },
    async get(_userId: string, requestedWorkspaceId: string) {
      if (requestedWorkspaceId !== workspaceId) return null;
      return { ...approval, proposedContent };
    },
    async decide(
      _userId: string,
      _workspace: string,
      _id: string,
      input: {
        readonly decision: "approved" | "rejected";
      },
    ) {
      return { ...approval, status: input.decision };
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
    approvals,
  });
  return { app, approvals };
}

describe("approval API contract", () => {
  it("returns proposal content only from the owner-authorized detail endpoint", async () => {
    const { app } = createTestApp();
    const list = await request(app)
      .get(`/api/v1/workspaces/${workspaceId}/approvals`)
      .set("Cookie", "__Host-flowpilot_access=owner-session")
      .expect(200);
    expect(list.body).toEqual([approval]);
    expect(JSON.stringify(list.body)).not.toContain("Sign the contract.");

    const detail = await request(app)
      .get(`/api/v1/workspaces/${workspaceId}/approvals/${approvalId}`)
      .set("Cookie", "__Host-flowpilot_access=owner-session")
      .expect(200);
    expect(detail.body).toMatchObject({
      ...approval,
      proposedContent,
    });
  });

  it("records an owner decision and returns the stable approval response", async () => {
    const { app } = createTestApp();
    const response = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/approvals/${approvalId}/decision`)
      .set("Cookie", "__Host-flowpilot_access=owner-session")
      .set("Origin", config.APP_ORIGIN)
      .send({ decision: "approved" })
      .expect(200);

    expect(response.body).toMatchObject({
      id: approvalId,
      status: "approved",
      targetReportId: reportId,
      expectedReportRevision: 3,
    });
    expect(response.body).not.toHaveProperty("proposedContent");
  });

  it("does not retrieve approval details from another workspace", async () => {
    const { app, approvals } = createTestApp();
    const get = vi.spyOn(approvals, "get");
    const response = await request(app)
      .get(`/api/v1/workspaces/${workspaceId}/approvals/${approvalId}`)
      .set("Cookie", "__Host-flowpilot_access=other-session")
      .expect(404);

    expect(response.body.error.code).toBe("NOT_FOUND");
    expect(JSON.stringify(response.body)).not.toContain("Sign the contract.");
    expect(get).not.toHaveBeenCalled();
  });

  it("does not allow another workspace owner to make an approval decision", async () => {
    const { app, approvals } = createTestApp();
    const decide = vi.spyOn(approvals, "decide");
    for (const decision of ["approved", "rejected"] as const) {
      const response = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/approvals/${approvalId}/decision`)
        .set("Cookie", "__Host-flowpilot_access=other-session")
        .set("Origin", config.APP_ORIGIN)
        .send({ decision })
        .expect(404);

      expect(response.body.error.code).toBe("NOT_FOUND");
      expect(JSON.stringify(response.body)).not.toContain("Sign the contract.");
    }
    expect(decide).not.toHaveBeenCalled();
  });

  it("does not list approval summaries for another workspace", async () => {
    const { app, approvals } = createTestApp();
    const list = vi.spyOn(approvals, "list");
    const response = await request(app)
      .get(`/api/v1/workspaces/${workspaceId}/approvals`)
      .set("Cookie", "__Host-flowpilot_access=other-session")
      .expect(404);

    expect(response.body.error.code).toBe("NOT_FOUND");
    expect(JSON.stringify(response.body)).not.toContain("Sign the contract.");
    expect(list).not.toHaveBeenCalled();
  });

  it("returns conflict when a report revision makes an approval stale", async () => {
    const { app, approvals } = createTestApp();
    vi.spyOn(approvals, "decide").mockRejectedValue(
      new HttpError(409, "CONFLICT", "The report revision is stale."),
    );
    const response = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/approvals/${approvalId}/decision`)
      .set("Cookie", "__Host-flowpilot_access=owner-session")
      .set("Origin", config.APP_ORIGIN)
      .send({ decision: "approved" })
      .expect(409);

    expect(response.body.error.code).toBe("CONFLICT");
  });
});

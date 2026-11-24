import request from "supertest";
import { describe, expect, it } from "vitest";
import type { AppConfig } from "../src/config.js";
import { createApp } from "../src/app.js";
import { hashSessionToken } from "../src/middleware/session.js";
import { InvalidCredentialsError } from "../src/modules/auth/service.js";

const config = {
  DATABASE_URL: "postgresql://app:pass@localhost:5432/flowpilot",
  MIGRATION_URL: "postgresql://migration:pass@localhost:5432/flowpilot",
  REDIS_URL: "redis://localhost:6379",
  OBJECT_STORAGE_ENDPOINT: "http://localhost:9000",
  OBJECT_STORAGE_REGION: "us-east-1",
  OBJECT_STORAGE_BUCKET: "private",
  OBJECT_STORAGE_ACCESS_KEY: "local-key",
  OBJECT_STORAGE_SECRET_KEY: "local-secret",
  OBJECT_STORAGE_PRESIGN_TTL_SECONDS: 300,
  OPENROUTER_API_KEY: "local-key",
  OPENROUTER_MODEL: "approved/model",
  OPENROUTER_TIMEOUT_MS: 30_000,
  SESSION_COOKIE_NAME: "flowpilot_session",
  SESSION_COOKIE_SECURE: true,
  APP_ORIGIN: "https://flowpilot.example",
  API_PORT: 3001,
  API_BODY_LIMIT: "1mb",
  API_INTERNAL_URL: "http://localhost:3001",
} satisfies AppConfig;

const firstUser = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "first@example.com",
};
const secondUser = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "second@example.com",
};
const firstWorkspace = {
  id: "00000000-0000-4000-8000-000000000011",
  ownerId: firstUser.id,
  name: "First workspace",
  createdAt: "2026-01-01T00:00:00.000Z",
};
const secondWorkspace = {
  id: "00000000-0000-4000-8000-000000000012",
  ownerId: secondUser.id,
  name: "Second workspace",
  createdAt: "2026-01-02T00:00:00.000Z",
};
const firstToken = "first-user-opaque-session-token";
const secondToken = "second-user-opaque-session-token";

function createTestApp() {
  const sessions = new Map([
    [hashSessionToken(firstToken), firstUser],
    [hashSessionToken(secondToken), secondUser],
  ]);
  const workspaces = [firstWorkspace, secondWorkspace];
  const deletionRequests: Array<{
    userId: string;
    workspaceId: string;
    documentId: string;
  }> = [];
  const services = {
    auth: {
      async register() {
        return { user: firstUser, sessionToken: firstToken };
      },
      async login(input: { email: string; password: string }) {
        if (
          input.email !== firstUser.email ||
          input.password !== "correct horse battery"
        ) {
          throw new InvalidCredentialsError();
        }
        return { user: firstUser, sessionToken: firstToken };
      },
      async resolveSession(tokenHash: string) {
        return sessions.get(tokenHash) ?? null;
      },
      async revokeSession(tokenHash: string) {
        sessions.delete(tokenHash);
      },
    },
    workspaces: {
      async list(userId: string) {
        return workspaces.filter((workspace) => workspace.ownerId === userId);
      },
      async create(userId: string, name: string) {
        const workspace = {
          id: "00000000-0000-4000-8000-000000000013",
          ownerId: userId,
          name,
          createdAt: new Date().toISOString(),
        };
        workspaces.push(workspace);
        return workspace;
      },
      async rename(userId: string, workspaceId: string, name: string) {
        const workspace = workspaces.find(
          (item) => item.id === workspaceId && item.ownerId === userId,
        );
        if (!workspace) return null;
        const updated = { ...workspace, name };
        workspaces.splice(workspaces.indexOf(workspace), 1, updated);
        return updated;
      },
      async verifyOwner(userId: string, workspaceId: string) {
        return workspaces.some(
          (workspace) => workspace.id === workspaceId && workspace.ownerId === userId,
        );
      },
    },
    documents: {
      async list() {
        return [];
      },
      async createUploadIntent() {
        throw new Error("Not implemented in this contract fixture.");
      },
      async completeUpload() {
        throw new Error("Not implemented in this contract fixture.");
      },
      async requestDeletion(userId: string, workspaceId: string, documentId: string) {
        deletionRequests.push({ userId, workspaceId, documentId });
      },
    },
  };
  return { app: createApp(config, services), sessions, deletionRequests };
}

describe("authentication and workspace API contract", () => {
  it("registers without returning the password or session token", async () => {
    const { app } = createTestApp();
    const response = await request(app)
      .post("/api/v1/auth/register")
      .set("Origin", config.APP_ORIGIN)
      .send({ email: "first@example.com", password: "correct horse battery" })
      .expect(201);

    expect(response.body).toEqual(firstUser);
    const cookie = response.headers["set-cookie"]?.[0] ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(JSON.stringify(response.body)).not.toContain("password");
    expect(JSON.stringify(response.body)).not.toContain(firstToken);
  });

  it("signs in with valid credentials and sets the opaque session cookie", async () => {
    const { app } = createTestApp();
    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", config.APP_ORIGIN)
      .send({ email: "first@example.com", password: "correct horse battery" })
      .expect(200);

    expect(response.body).toEqual(firstUser);
    expect(response.headers["set-cookie"]?.[0] ?? "").toContain("flowpilot_session=");
  });

  it("uses the same credential error for an unknown account and a wrong password", async () => {
    const { app } = createTestApp();
    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", config.APP_ORIGIN)
      .send({ email: "unknown@example.com", password: "incorrect password" })
      .expect(401);

    expect(response.body.error.code).toBe("UNAUTHENTICATED");
    expect(response.body.error.message).toBe("Email or password is incorrect.");
  });

  it("lists and creates only creator-owned workspaces", async () => {
    const { app } = createTestApp();
    const cookie = `flowpilot_session=${firstToken}`;
    const list = await request(app)
      .get("/api/v1/workspaces")
      .set("Cookie", cookie)
      .expect(200);
    expect(list.body).toEqual([firstWorkspace]);

    const created = await request(app)
      .post("/api/v1/workspaces")
      .set("Origin", config.APP_ORIGIN)
      .set("Cookie", cookie)
      .send({ name: "New workspace" })
      .expect(201);
    expect(created.body.ownerId).toBe(firstUser.id);
    expect(created.body.name).toBe("New workspace");
  });

  it("hides and rejects workspaces owned by another account", async () => {
    const { app } = createTestApp();
    const cookie = `flowpilot_session=${firstToken}`;
    const response = await request(app)
      .patch(`/api/v1/workspaces/${secondWorkspace.id}`)
      .set("Origin", config.APP_ORIGIN)
      .set("Cookie", cookie)
      .send({ name: "stolen" })
      .expect(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
    expect(JSON.stringify(response.body)).not.toContain(secondWorkspace.name);
  });

  it("allows a workspace owner to rename their workspace", async () => {
    const { app } = createTestApp();
    const response = await request(app)
      .patch(`/api/v1/workspaces/${firstWorkspace.id}`)
      .set("Origin", config.APP_ORIGIN)
      .set("Cookie", `flowpilot_session=${firstToken}`)
      .send({ name: "Renamed workspace" })
      .expect(200);
    expect(response.body.name).toBe("Renamed workspace");
    expect(response.body.ownerId).toBe(firstUser.id);
  });

  it("revokes the current opaque session on logout", async () => {
    const { app, sessions } = createTestApp();
    const response = await request(app)
      .post("/api/v1/auth/logout")
      .set("Origin", config.APP_ORIGIN)
      .set("Cookie", `flowpilot_session=${firstToken}`)
      .expect(204);

    expect(sessions.has(hashSessionToken(firstToken))).toBe(false);
    expect(response.headers["set-cookie"]?.[0] ?? "").toContain(
      "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    );
    await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", `flowpilot_session=${firstToken}`)
      .expect(401);
  });

  it("allows an owner to request document deletion", async () => {
    const { app, deletionRequests } = createTestApp();
    const documentId = "00000000-0000-4000-8000-000000000021";

    await request(app)
      .delete(`/api/v1/workspaces/${firstWorkspace.id}/documents/${documentId}`)
      .set("Origin", config.APP_ORIGIN)
      .set("Cookie", `flowpilot_session=${firstToken}`)
      .expect(202);

    expect(deletionRequests).toEqual([
      {
        userId: firstUser.id,
        workspaceId: firstWorkspace.id,
        documentId,
      },
    ]);
  });

  it("does not expose or delete a document in another owner's workspace", async () => {
    const { app, deletionRequests } = createTestApp();

    const response = await request(app)
      .delete(
        `/api/v1/workspaces/${secondWorkspace.id}/documents/00000000-0000-4000-8000-000000000021`,
      )
      .set("Origin", config.APP_ORIGIN)
      .set("Cookie", `flowpilot_session=${firstToken}`)
      .expect(404);

    expect(response.body.error.code).toBe("NOT_FOUND");
    expect(deletionRequests).toHaveLength(0);
  });
});

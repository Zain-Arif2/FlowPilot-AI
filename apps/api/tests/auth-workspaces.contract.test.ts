import request from "supertest";
import { describe, expect, it } from "vitest";
import type { AppConfig } from "../src/config.js";
import { createApp } from "../src/app.js";
import { InvalidCredentialsError } from "../src/modules/auth/service.js";

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
const firstToken = "first-user-access-jwt";
const secondToken = "second-user-access-jwt";
const firstRefreshToken = "first-user-refresh-jwt";

function createTestApp() {
  const accessTokens = new Map([
    [firstToken, firstUser],
    [secondToken, secondUser],
  ]);
  const refreshTokens = new Map([[firstRefreshToken, firstUser]]);
  const workspaces = [firstWorkspace, secondWorkspace];
  const deletionRequests: Array<{
    userId: string;
    workspaceId: string;
    documentId: string;
  }> = [];
  const services = {
    auth: {
      async register() {
        return {
          user: firstUser,
          accessToken: firstToken,
          refreshToken: firstRefreshToken,
        };
      },
      async login(input: { email: string; password: string }) {
        if (
          input.email !== firstUser.email ||
          input.password !== "correct horse battery"
        ) {
          throw new InvalidCredentialsError();
        }
        return {
          user: firstUser,
          accessToken: firstToken,
          refreshToken: firstRefreshToken,
        };
      },
      async refresh(rawRefreshToken: string) {
        const user = refreshTokens.get(rawRefreshToken);
        if (!user) return null;
        refreshTokens.delete(rawRefreshToken);
        const rotatedRefresh = `${rawRefreshToken}-rotated`;
        refreshTokens.set(rotatedRefresh, user);
        return {
          user,
          accessToken: `${firstToken}-rotated`,
          refreshToken: rotatedRefresh,
        };
      },
      verifyAccessToken(token: string) {
        return accessTokens.get(token) ?? null;
      },
      async logout(rawRefreshToken: string | undefined) {
        if (rawRefreshToken) {
          refreshTokens.delete(rawRefreshToken);
        }
        accessTokens.delete(firstToken);
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
      async uploadDocument() {
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
  return { app: createApp(config, services), refreshTokens, deletionRequests };
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
    expect(response.headers["set-cookie"]?.[0] ?? "").toContain("__Host-flowpilot_access=");
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
    const cookie = `__Host-flowpilot_access=${firstToken}`;
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
    const cookie = `__Host-flowpilot_access=${firstToken}`;
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
      .set("Cookie", `__Host-flowpilot_access=${firstToken}`)
      .send({ name: "Renamed workspace" })
      .expect(200);
    expect(response.body.name).toBe("Renamed workspace");
    expect(response.body.ownerId).toBe(firstUser.id);
  });

  it("revokes the refresh token and clears both auth cookies on logout", async () => {
    const { app, refreshTokens } = createTestApp();
    const response = await request(app)
      .post("/api/v1/auth/logout")
      .set("Origin", config.APP_ORIGIN)
      .set(
        "Cookie",
        `__Host-flowpilot_access=${firstToken}; __Host-flowpilot_refresh=${firstRefreshToken}`,
      )
      .expect(204);

    expect(refreshTokens.has(firstRefreshToken)).toBe(false);
    const rawSetCookie = response.headers["set-cookie"];
    const setCookies = Array.isArray(rawSetCookie) ? rawSetCookie : [];
    expect(setCookies.some((c: string) => c.includes("__Host-flowpilot_access=;"))).toBe(true);
    expect(setCookies.some((c: string) => c.includes("__Host-flowpilot_refresh=;"))).toBe(true);
    await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", `__Host-flowpilot_access=${firstToken}`)
      .expect(401);
  });

  it("rotates refresh tokens and issues fresh HttpOnly cookies on /auth/refresh", async () => {
    const { app, refreshTokens } = createTestApp();
    const response = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Origin", config.APP_ORIGIN)
      .set("Cookie", `__Host-flowpilot_refresh=${firstRefreshToken}`)
      .expect(200);

    expect(response.body).toEqual(firstUser);
    expect(refreshTokens.has(firstRefreshToken)).toBe(false);
    expect(refreshTokens.has(`${firstRefreshToken}-rotated`)).toBe(true);
  });

  it("allows an owner to request document deletion", async () => {
    const { app, deletionRequests } = createTestApp();
    const documentId = "00000000-0000-4000-8000-000000000021";

    await request(app)
      .delete(`/api/v1/workspaces/${firstWorkspace.id}/documents/${documentId}`)
      .set("Origin", config.APP_ORIGIN)
      .set("Cookie", `__Host-flowpilot_access=${firstToken}`)
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
      .set("Cookie", `__Host-flowpilot_access=${firstToken}`)
      .expect(404);

    expect(response.body.error.code).toBe("NOT_FOUND");
    expect(deletionRequests).toHaveLength(0);
  });
});

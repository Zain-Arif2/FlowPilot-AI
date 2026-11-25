import { EventEmitter } from "node:events";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../src/config.js";
import { createApp } from "../src/app.js";
import {
  createRateLimitMiddleware,
  createRedisRateLimitStore,
  type RateLimitStore,
} from "../src/middleware/rate-limit.js";

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

const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "owner@example.com",
};

function createTestApp(store: RateLimitStore) {
  const login = vi.fn(async () => ({
    user,
    accessToken: "access-jwt",
    refreshToken: "refresh-jwt",
  }));
  const app = createApp(config, {
    auth: {
      async register() {
        return { user, accessToken: "access-jwt", refreshToken: "refresh-jwt" };
      },
      login,
      async refresh() {
        return { user, accessToken: "access-jwt", refreshToken: "refresh-jwt" };
      },
      verifyAccessToken() {
        return user;
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
      async verifyOwner() {
        return true;
      },
    },
    rateLimiter: createRateLimitMiddleware(store),
  });
  return { app, login };
}

describe("Redis-backed API rate limits", () => {
  it("limits repeated authentication requests and returns a stable 429", async () => {
    const counts = new Map<string, number>();
    const store: RateLimitStore = {
      async consume(key) {
        const nextCount = (counts.get(key) ?? 0) + 1;
        counts.set(key, nextCount);
        return nextCount;
      },
    };
    const { app, login } = createTestApp(store);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app)
        .post("/api/v1/auth/login")
        .set("Origin", config.APP_ORIGIN)
        .send({ email: user.email, password: "example-password" })
        .expect(200);
    }
    const limited = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", config.APP_ORIGIN)
      .send({ email: user.email, password: "example-password" })
      .expect(429);

    expect(limited.body.error.code).toBe("RATE_LIMITED");
    expect(limited.headers["ratelimit-limit"]).toBe("10");
    expect(limited.headers["retry-after"]).toBe("900");
    expect(login).toHaveBeenCalledTimes(10);
  });

  it("fails closed when the shared limiter store is unavailable", async () => {
    const { app, login } = createTestApp({
      async consume() {
        throw new Error("Redis unavailable.");
      },
    });

    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", config.APP_ORIGIN)
      .send({ email: user.email, password: "example-password" })
      .expect(503);

    expect(response.body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(login).not.toHaveBeenCalled();
  });

  it("waits briefly for a reconnecting Redis client to become ready before executing multi()", async () => {
    const emitter = new EventEmitter() as EventEmitter & {
      status: string;
      multi: () => {
        incr: () => unknown;
        pexpire: () => unknown;
        exec: () => Promise<[null, number][]>;
      };
    };
    emitter.status = "reconnecting";
    const exec = vi.fn(async () => [
      [null, 1] as [null, number],
      [null, 1] as [null, number],
    ]);
    emitter.multi = () => {
      const chain = {
        incr: () => chain,
        pexpire: () => chain,
        exec,
      };
      return chain;
    };

    const store = createRedisRateLimitStore(
      emitter as unknown as Parameters<typeof createRedisRateLimitStore>[0],
    );
    const pending = store.consume("flowpilot:rate:test", 60_000);
    expect(exec).not.toHaveBeenCalled();

    emitter.status = "ready";
    emitter.emit("ready");

    await expect(pending).resolves.toBe(1);
    expect(exec).toHaveBeenCalledOnce();
  });

  it("fails closed when the Redis rate-limit client is closed", async () => {
    const emitter = new EventEmitter() as EventEmitter & {
      status: string;
      multi: () => never;
    };
    emitter.status = "end";
    emitter.multi = () => {
      throw new Error("Should not call multi when closed");
    };

    const store = createRedisRateLimitStore(
      emitter as unknown as Parameters<typeof createRedisRateLimitStore>[0],
    );
    await expect(store.consume("flowpilot:rate:test", 60_000)).rejects.toThrow(
      /closed/,
    );
  });
});

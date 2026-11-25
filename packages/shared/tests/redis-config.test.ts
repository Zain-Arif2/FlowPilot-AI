import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  buildRedisClientOptions,
  parseRedisUrl,
  RedisUrlSchema,
  waitForRedisReadyAndPing,
  type RedisReadyClient,
} from "../src/redis/index.js";

class MockRedisClient extends EventEmitter implements RedisReadyClient {
  status: string;
  ping = vi.fn(async () => "PONG");

  constructor(initialStatus = "connecting") {
    super();
    this.status = initialStatus;
  }
}

describe("Redis configuration and readiness helper", () => {
  it("parses rediss:// URLs with TLS enabled and default port", () => {
    expect(parseRedisUrl("rediss://default:secret@example.upstash.io:6379")).toEqual({
      host: "example.upstash.io",
      port: 6379,
      tls: true,
    });
    expect(parseRedisUrl("redis://localhost:6379")).toEqual({
      host: "localhost",
      port: 6379,
      tls: false,
    });
  });

  it("rejects HTTP/HTTPS REST URLs so Upstash REST URLs are never passed to ioredis", () => {
    expect(() => parseRedisUrl("https://example.upstash.io")).toThrow(
      /not an HTTP\/REST URL/,
    );
    const parsed = RedisUrlSchema.safeParse("https://example.upstash.io");
    expect(parsed.success).toBe(false);
  });

  it("builds distinct options for rate-limit and BullMQ modes with TLS SNI", () => {
    const apiOptions = buildRedisClientOptions(
      "rediss://default:secret@example.upstash.io:6379",
      "rate-limit",
    );
    expect(apiOptions.maxRetriesPerRequest).toBe(1);
    expect(apiOptions.enableOfflineQueue).toBe(false);
    expect(apiOptions.tls).toEqual({ servername: "example.upstash.io" });
    expect(apiOptions.connectTimeout).toBeGreaterThanOrEqual(5_000);

    const workerOptions = buildRedisClientOptions(
      "rediss://default:secret@example.upstash.io:6379",
      "bullmq",
    );
    expect(workerOptions.maxRetriesPerRequest).toBeNull();
    expect(workerOptions.enableOfflineQueue).toBe(true);
    expect(workerOptions.tls).toEqual({ servername: "example.upstash.io" });
  });

  it("waits for the ready event before calling ping() so enableOfflineQueue: false does not fail", async () => {
    const client = new MockRedisClient("connecting");
    const target = { host: "example.upstash.io", port: 6379, tls: true };

    const promise = waitForRedisReadyAndPing(client, target, 1_000);
    expect(client.ping).not.toHaveBeenCalled();

    client.status = "ready";
    client.emit("ready");

    await expect(promise).resolves.toBeUndefined();
    expect(client.ping).toHaveBeenCalledOnce();
  });

  it("rejects with a sanitized actionable error when connection fails before ready", async () => {
    const client = new MockRedisClient("connecting");
    const target = { host: "example.upstash.io", port: 6379, tls: true };

    const promise = waitForRedisReadyAndPing(client, target, 1_000);
    client.emit(
      "error",
      new Error("Failed connecting to rediss://default:topsecret@example.upstash.io:6379"),
    );
    client.status = "end";
    client.emit("end");

    await expect(promise).rejects.toThrow(
      /Redis connection to example\.upstash\.io:6379 \(tls=true\) failed: Error: Failed connecting to \[REDACTED_REDIS_URL\]/,
    );
    expect(client.ping).not.toHaveBeenCalled();
  });
});


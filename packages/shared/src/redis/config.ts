import { z } from "zod";

export const DEFAULT_REDIS_CONNECT_TIMEOUT_MS = 10_000;
export const DEFAULT_REDIS_KEEP_ALIVE_MS = 30_000;
export const DEFAULT_REDIS_MAX_RETRY_DELAY_MS = 3_000;

export interface SafeRedisTarget {
  readonly host: string;
  readonly port: number;
  readonly tls: boolean;
}

export type RedisClientMode = "rate-limit" | "bullmq";

export interface RedisClientOptions {
  readonly connectTimeout: number;
  readonly keepAlive: number;
  readonly maxRetriesPerRequest: number | null;
  readonly enableOfflineQueue: boolean;
  readonly tls?: { readonly servername: string };
  readonly retryStrategy: (times: number) => number;
}

export interface RedisReadyClient {
  readonly status: string;
  ping(): Promise<string>;
  once(event: "ready", listener: () => void): unknown;
  once(event: "end", listener: () => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  off(event: "ready" | "end", listener: () => void): unknown;
  off(event: "error", listener: (error: Error) => void): unknown;
}

export function parseRedisUrl(redisUrl: string): SafeRedisTarget {
  let parsed: URL;
  try {
    parsed = new URL(redisUrl);
  } catch {
    throw new Error("REDIS_URL must be a valid URL.");
  }

  if (parsed.protocol === "http:" || parsed.protocol === "https:") {
    throw new Error(
      "REDIS_URL must use redis:// or rediss:// (TCP protocol), not an HTTP/REST URL.",
    );
  }

  if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
    throw new Error("REDIS_URL must use the redis:// or rediss:// protocol.");
  }

  if (!parsed.hostname) {
    throw new Error("REDIS_URL must include a Redis hostname.");
  }

  const port = parsed.port ? Number(parsed.port) : 6379;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("REDIS_URL must include a valid TCP port.");
  }

  return {
    host: parsed.hostname,
    port,
    tls: parsed.protocol === "rediss:",
  };
}

export const RedisUrlSchema = z.string().superRefine((value, ctx) => {
  try {
    parseRedisUrl(value);
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: error instanceof Error ? error.message : "Invalid REDIS_URL.",
    });
  }
});

export function buildRedisClientOptions(
  redisUrl: string,
  mode: RedisClientMode,
): RedisClientOptions {
  const target = parseRedisUrl(redisUrl);

  return {
    connectTimeout: DEFAULT_REDIS_CONNECT_TIMEOUT_MS,
    keepAlive: DEFAULT_REDIS_KEEP_ALIVE_MS,
    maxRetriesPerRequest: mode === "bullmq" ? null : 1,
    enableOfflineQueue: mode === "bullmq",
    ...(target.tls ? { tls: { servername: target.host } } : {}),
    retryStrategy: (times: number) =>
      Math.min(Math.max(times, 1) * 200, DEFAULT_REDIS_MAX_RETRY_DELAY_MS),
  };
}

function sanitizeRedisErrorMessage(error: Error): string {
  return error.message.replace(/rediss?:\/\/[^\s]+/gi, "[REDACTED_REDIS_URL]");
}

export async function waitForRedisReadyAndPing(
  client: RedisReadyClient,
  target: SafeRedisTarget,
  timeoutMs = DEFAULT_REDIS_CONNECT_TIMEOUT_MS,
): Promise<void> {
  if (client.status === "end") {
    throw new Error(
      `Redis connection to ${target.host}:${target.port} (tls=${target.tls}) is already closed.`,
    );
  }

  if (client.status !== "ready") {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let lastError: Error | undefined;

      const cleanup = (): void => {
        clearTimeout(timer);
        client.off("ready", onReady);
        client.off("end", onEnd);
        client.off("error", onError);
      };

      const finishReject = (reason: string): void => {
        if (settled) return;
        settled = true;
        cleanup();
        const detail = lastError
          ? `${lastError.name}: ${sanitizeRedisErrorMessage(lastError)}`
          : reason;
        reject(
          new Error(
            `Redis connection to ${target.host}:${target.port} (tls=${target.tls}) failed: ${detail}`,
          ),
        );
      };

      const onReady = (): void => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };

      const onEnd = (): void => {
        finishReject("connection closed before becoming ready");
      };

      const onError = (error: Error): void => {
        lastError = error;
      };

      const timer = setTimeout(() => {
        finishReject(`timed out after ${timeoutMs}ms waiting for ready`);
      }, timeoutMs);

      client.once("ready", onReady);
      client.once("end", onEnd);
      client.on("error", onError);
    });
  }

  const pong = await client.ping();
  if (pong !== "PONG") {
    throw new Error(
      `Redis PING to ${target.host}:${target.port} returned unexpected response.`,
    );
  }
}

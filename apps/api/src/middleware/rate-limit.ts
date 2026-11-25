import { createHash } from "node:crypto";
import type { Redis } from "ioredis";
import type { Request, RequestHandler } from "express";
import { HttpError } from "../errors/api-error.js";
import { apiLogger } from "./logger.js";

interface RateLimitRule {
  readonly operation: string;
  readonly limit: number;
  readonly windowMs: number;
}

export interface RateLimitStore {
  consume(key: string, windowMs: number): Promise<number>;
}

const HOUR_MS = 60 * 60 * 1_000;

function ruleFor(request: Request): RateLimitRule | null {
  if (
    request.method === "POST" &&
    (request.path === "/auth/login" || request.path === "/auth/register")
  ) {
    return { operation: "auth", limit: 10, windowMs: 15 * 60 * 1_000 };
  }
  if (request.method === "POST" && request.path === "/auth/refresh") {
    return { operation: "auth-refresh", limit: 30, windowMs: 15 * 60 * 1_000 };
  }
  if (
    request.method === "POST" &&
    /^\/workspaces\/[^/]+\/workflow-proposals$/.test(request.path)
  ) {
    return { operation: "workflow-proposal", limit: 20, windowMs: HOUR_MS };
  }
  if (
    request.method === "POST" &&
    /^\/workspaces\/[^/]+\/documents$/.test(request.path)
  ) {
    return { operation: "document-upload", limit: 30, windowMs: HOUR_MS };
  }
  if (
    request.method === "POST" &&
    /^\/workspaces\/[^/]+\/workflows\/[^/]+\/executions$/.test(request.path)
  ) {
    return { operation: "workflow-execution", limit: 30, windowMs: HOUR_MS };
  }
  return null;
}

function rateLimitKey(request: Request, rule: RateLimitRule): string {
  const identity = request.authUser?.id ?? request.ip ?? "unknown";
  const digest = createHash("sha256").update(identity).digest("hex");
  const workspaceId = request.params.workspaceId ?? "global";
  return `flowpilot:rate:${rule.operation}:${workspaceId}:${digest}`;
}

const REDIS_READY_WAIT_MS = 2_500;

type RateLimitRedisClient = Pick<Redis, "multi"> &
  Partial<Pick<Redis, "status" | "once" | "off" | "on">>;

async function ensureRedisReady(redis: RateLimitRedisClient): Promise<void> {
  if (
    typeof redis.status !== "string" ||
    typeof redis.once !== "function" ||
    typeof redis.off !== "function"
  ) {
    return;
  }
  if (redis.status === "ready") return;
  if (redis.status === "end") {
    throw new Error("Redis rate-limit connection is closed.");
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = (): void => {
      clearTimeout(timer);
      redis.off?.("ready", onReady);
      redis.off?.("end", onEnd);
    };
    const onReady = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onEnd = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Redis rate-limit connection closed before becoming ready."));
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Redis rate-limit connection timed out waiting for ready."));
    }, REDIS_READY_WAIT_MS);

    redis.once?.("ready", onReady);
    redis.once?.("end", onEnd);
  });
}

export function createRedisRateLimitStore(
  redis: RateLimitRedisClient,
): RateLimitStore {
  return {
    async consume(key, windowMs) {
      await ensureRedisReady(redis);
      const results = await redis
        .multi()
        .incr(key)
        .pexpire(key, windowMs)
        .exec();
      if (!results || results.some(([error]) => error !== null)) {
        throw new Error("Redis rate-limit transaction failed.");
      }
      const count = Number(results[0]?.[1]);
      if (!Number.isSafeInteger(count) || count < 1) {
        throw new Error("Redis returned an invalid rate-limit count.");
      }
      return count;
    },
  };
}

export function createRateLimitMiddleware(
  store: RateLimitStore,
): RequestHandler {
  return async (request, response, next) => {
    const rule = ruleFor(request);
    if (!rule) {
      next();
      return;
    }

    try {
      const count = await store.consume(rateLimitKey(request, rule), rule.windowMs);
      response.setHeader("RateLimit-Limit", rule.limit);
      response.setHeader("RateLimit-Remaining", Math.max(0, rule.limit - count));
      if (count > rule.limit) {
        response.setHeader("Retry-After", Math.ceil(rule.windowMs / 1_000));
        next(
          new HttpError(
            429,
            "RATE_LIMITED",
            "Too many requests. Please wait before trying again.",
          ),
        );
        return;
      }
      next();
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "Unknown error";
      apiLogger.error(
        {
          requestId: String(response.getHeader("X-Request-Id") ?? ""),
          operation: rule.operation,
          errorName: error instanceof Error ? error.name : "UNKNOWN",
          errorMessage: rawMessage.replace(/rediss?:\/\/[^\s]+/gi, "[REDACTED_REDIS_URL]"),
        },
        "Rate limit store unavailable",
      );
      next(
        new HttpError(
          503,
          "SERVICE_UNAVAILABLE",
          "Request protection is temporarily unavailable.",
        ),
      );
    }
  };
}

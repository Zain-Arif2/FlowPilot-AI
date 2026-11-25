import pino from "pino";
import type { RequestHandler } from "express";

const REDACTED_FIELDS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['set-cookie']",
  "password",
  "passwordHash",
  "token",
  "tokenHash",
  "accessToken",
  "refreshToken",
  "jwt",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "apiKey",
  "OPENROUTER_API_KEY",
  "prompt",
  "documentText",
  "reportContent",
];

export function createRedactedLogger(destination?: pino.DestinationStream) {
  return pino(
    {
      level: process.env.LOG_LEVEL ?? "info",
      redact: { paths: REDACTED_FIELDS, censor: "[REDACTED]" },
    },
    destination,
  );
}

export const apiLogger = createRedactedLogger();

export function createRequestLogger(): RequestHandler {
  return (request, response, next) => {
    const startedAt = performance.now();
    response.once("finish", () => {
      const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
      apiLogger.info(
        {
          requestId: response.getHeader("X-Request-Id"),
          method: request.method,
          path: request.path,
          statusCode: response.statusCode,
          durationMs,
          workspaceId: request.workspaceContext?.workspaceId,
        },
        "API request completed",
      );
    });
    next();
  };
}

import type { ErrorRequestHandler } from "express";
import { createApiError } from "@flowpilot/shared";
import { HttpError } from "../errors/api-error.js";
import { apiLogger } from "./logger.js";

interface BodyParserError extends SyntaxError {
  readonly status?: number;
  readonly type?: string;
}

function isBodyParserError(error: unknown): error is BodyParserError {
  return (
    error instanceof SyntaxError &&
    "status" in error &&
    typeof error.status === "number" &&
    "type" in error &&
    error.type === "entity.parse.failed"
  );
}

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  request,
  response,
  _next,
) => {
  void _next;
  const requestId = response.getHeader("X-Request-Id");
  if (error instanceof HttpError) {
    apiLogger.warn(
      { requestId: String(requestId), code: error.code, statusCode: error.status },
      "API request rejected",
    );
    response.status(error.status).json(
      createApiError({
        code: error.code,
        message: error.message,
        requestId: String(requestId),
      }),
    );
    return;
  }

  if (isBodyParserError(error)) {
    response.status(400).json(
      createApiError({
        code: "INVALID_INPUT",
        message: "Request body must contain valid JSON.",
        requestId: String(requestId),
      }),
    );
    return;
  }

  apiLogger.error(
    {
      requestId: String(requestId),
      errorName: error instanceof Error ? error.name : "UnknownError",
    },
    "Unhandled API request error",
  );
  response.status(500).json(
    createApiError({
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
      requestId: String(requestId),
    }),
  );
};

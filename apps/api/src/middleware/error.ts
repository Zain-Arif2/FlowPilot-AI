import type { ErrorRequestHandler } from "express";
import { createApiError } from "@flowpilot/shared";
import { HttpError } from "../errors/api-error.js";
import { apiLogger } from "./logger.js";

interface BodyParserError extends Error {
  readonly status?: number;
  readonly type?: string;
}

function isBodyParserError(error: unknown): error is BodyParserError {
  return (
    error instanceof Error &&
    "status" in error &&
    typeof error.status === "number" &&
    "type" in error &&
    typeof error.type === "string"
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
    if (error.status === 413) {
      response.status(413).json(
        createApiError({
          code: "PAYLOAD_TOO_LARGE",
          message: "The uploaded file exceeds the configured document size limit.",
          requestId: String(requestId),
        }),
      );
      return;
    }
    if (error.status === 415) {
      response.status(415).json(
        createApiError({
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: "The request body type is not supported.",
          requestId: String(requestId),
        }),
      );
      return;
    }
    response.status(400).json(
      createApiError({
        code: "INVALID_INPUT",
        message:
          error.type === "entity.parse.failed"
            ? "Request body must contain valid JSON."
            : "The request body could not be read.",
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

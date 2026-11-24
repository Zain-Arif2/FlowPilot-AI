import type { RequestHandler } from "express";
import { HttpError } from "../errors/api-error.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isSameOrigin(origin: string, allowedOrigin: string): boolean {
  try {
    return new URL(origin).origin === new URL(allowedOrigin).origin;
  } catch {
    return false;
  }
}

export function createCsrfProtection(allowedOrigin: string): RequestHandler {
  return (request, _response, next) => {
    if (SAFE_METHODS.has(request.method)) {
      next();
      return;
    }

    const origin = request.get("origin");
    const fetchSite = request.get("sec-fetch-site");
    if (
      !origin ||
      !isSameOrigin(origin, allowedOrigin) ||
      fetchSite?.toLowerCase() === "cross-site"
    ) {
      next(new HttpError(403, "CSRF_FAILED", "Request origin is not allowed."));
      return;
    }
    next();
  };
}

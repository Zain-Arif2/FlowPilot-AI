import type { RequestHandler } from "express";
import { isSameOrigin } from "./csrf.js";

export function createCorsPolicy(allowedOrigin: string): RequestHandler {
  return (request, response, next) => {
    const origin = request.get("origin");
    if (!origin || !isSameOrigin(origin, allowedOrigin)) {
      if (request.method === "OPTIONS") {
        response.status(403).end();
        return;
      }
      next();
      return;
    }

    response.vary("Origin");
    response.setHeader("Access-Control-Allow-Origin", new URL(allowedOrigin).origin);
    response.setHeader("Access-Control-Allow-Credentials", "true");

    if (request.method === "OPTIONS") {
      response.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, PATCH, DELETE, OPTIONS",
      );
      response.setHeader("Access-Control-Allow-Headers", "Content-Type");
      response.status(204).end();
      return;
    }
    next();
  };
}

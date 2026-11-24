import type { RequestHandler } from "express";
import { randomUUID } from "node:crypto";

export const requestContext: RequestHandler = (_request, response, next) => {
  response.setHeader("X-Request-Id", randomUUID());
  next();
};

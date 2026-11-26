import type { RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import {
  withRequestQueryMetrics,
  type RequestQueryMetrics,
} from "@flowpilot/db";

const responseMetrics = new WeakMap<object, RequestQueryMetrics>();

export function getRequestMetrics(
  response: object,
): RequestQueryMetrics | undefined {
  return responseMetrics.get(response);
}

export const requestContext: RequestHandler = (_request, response, next) => {
  response.setHeader("X-Request-Id", randomUUID());
  const metrics: RequestQueryMetrics = {
    dbQueryCount: 0,
    dbQueryDurationMs: 0,
    dbQueryMaxMs: 0,
    authDurationMs: 0,
    tenantAuthDurationMs: 0,
  };
  responseMetrics.set(response, metrics);
  withRequestQueryMetrics(metrics, next);
};

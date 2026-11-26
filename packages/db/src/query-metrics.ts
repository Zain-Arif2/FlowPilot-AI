import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestQueryMetrics {
  dbQueryCount: number;
  dbQueryDurationMs: number;
  dbQueryMaxMs: number;
  authDurationMs: number;
  tenantAuthDurationMs: number;
  [name: string]: number;
}

const requestMetrics = new AsyncLocalStorage<RequestQueryMetrics>();

export function withRequestQueryMetrics<T>(
  metrics: RequestQueryMetrics,
  callback: () => T,
): T {
  return requestMetrics.run(metrics, callback);
}

export function recordDatabaseQuery(durationMs: number): void {
  const metrics = requestMetrics.getStore();
  if (!metrics) return;
  metrics.dbQueryCount += 1;
  metrics.dbQueryDurationMs += durationMs;
  metrics.dbQueryMaxMs = Math.max(metrics.dbQueryMaxMs, durationMs);
}

export async function measureDatabaseQuery<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    recordDatabaseQuery(performance.now() - startedAt);
  }
}

export function recordRequestTiming(name: string, durationMs: number): void {
  const metrics = requestMetrics.getStore();
  if (!metrics) return;
  metrics[name] = (metrics[name] ?? 0) + durationMs;
}

export function getRequestQueryMetrics():
  | RequestQueryMetrics
  | undefined {
  return requestMetrics.getStore();
}

export type FailureKind = "transient" | "permanent";

export interface RetryInput {
  readonly failureKind: FailureKind;
  readonly attemptNumber: number;
  readonly explicitlyRetryable: boolean;
}

export type RetryDecision =
  { readonly retry: false } | { readonly retry: true; readonly delayMs: number };

export const MAX_AUTOMATIC_ATTEMPTS = 3;
const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

export function getRetryDecision(
  input: RetryInput,
  random: () => number = Math.random,
): RetryDecision {
  if (!Number.isInteger(input.attemptNumber) || input.attemptNumber < 1) {
    throw new RangeError("Attempt number must be a positive integer.");
  }
  if (
    !input.explicitlyRetryable ||
    input.failureKind !== "transient" ||
    input.attemptNumber >= MAX_AUTOMATIC_ATTEMPTS
  ) {
    return { retry: false };
  }

  const randomValue = random();
  if (randomValue < 0 || randomValue > 1 || !Number.isFinite(randomValue)) {
    throw new RangeError("Retry jitter source must return a value between 0 and 1.");
  }
  const exponential = Math.min(
    INITIAL_BACKOFF_MS * 2 ** (input.attemptNumber - 1),
    MAX_BACKOFF_MS,
  );
  const delayMs = Math.round(exponential * (0.5 + randomValue * 0.5));
  return { retry: true, delayMs };
}

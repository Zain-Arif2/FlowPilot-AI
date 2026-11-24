import pino from "pino";

export const workerLogger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "password",
      "passwordHash",
      "token",
      "tokenHash",
      "apiKey",
      "prompt",
      "documentText",
      "reportContent",
      "OPENROUTER_API_KEY",
    ],
    censor: "[REDACTED]",
  },
});

export interface SafeExecutionLogFields {
  readonly requestId?: string;
  readonly workspaceId?: string;
  readonly executionId: string;
  readonly stepId?: string;
  readonly event: string;
  readonly durationMs?: number;
  readonly errorCode?: string;
}

export function logExecution(fields: SafeExecutionLogFields): void {
  workerLogger.info(fields, "Workflow execution event");
}

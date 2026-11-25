import pino from "pino";

export function createWorkerLogger(destination?: pino.DestinationStream) {
  return pino(
    {
      level: process.env.LOG_LEVEL ?? "info",
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.headers['set-cookie']",
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
    },
    destination,
  );
}

export const workerLogger = createWorkerLogger();

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

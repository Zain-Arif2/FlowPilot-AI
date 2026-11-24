import type { ApiErrorCode } from "@flowpilot/shared";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

import { z } from "zod";
import { ApiErrorCodeSchema, ApiErrorSchema } from "../schemas/common.js";

export const RequestIdSchema = z.string().min(1).max(128);

export const ApiErrorCode = ApiErrorCodeSchema.enum;

export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;
export type ApiErrorResponse = z.infer<typeof ApiErrorSchema>;

export interface ApiErrorDetails {
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly requestId: string;
}

export function createApiError(details: ApiErrorDetails): ApiErrorResponse {
  return ApiErrorSchema.parse({ error: details });
}

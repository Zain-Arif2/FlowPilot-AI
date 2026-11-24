import { ApiErrorSchema } from "@flowpilot/shared";

interface ResponseSchema<T> {
  parse(value: unknown): T;
}

interface JsonRequestOptions {
  readonly method?: "GET" | "POST" | "PATCH" | "DELETE";
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ApiRequestError(
      response.status,
      "INVALID_RESPONSE",
      "The server returned an invalid response.",
    );
  }
}

function responseError(status: number, payload: unknown): ApiRequestError {
  const parsed = ApiErrorSchema.safeParse(payload);
  if (parsed.success) {
    return new ApiRequestError(
      status,
      parsed.data.error.code,
      parsed.data.error.message,
    );
  }
  return new ApiRequestError(
    status,
    "REQUEST_FAILED",
    "The request could not be completed.",
  );
}

export async function apiRequest<T>(
  path: string,
  schema: ResponseSchema<T>,
  options: JsonRequestOptions = {},
): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method: options.method ?? "GET",
    credentials: "include",
    cache: "no-store",
    ...(options.body === undefined
      ? {}
      : {
          headers: {
            "Content-Type": "application/json",
            ...options.headers,
          },
          body: JSON.stringify(options.body),
        }),
    ...(options.body === undefined && options.headers
      ? { headers: options.headers }
      : {}),
  });
  const payload = await readJson(response);
  if (!response.ok) throw responseError(response.status, payload);
  return schema.parse(payload);
}

export async function apiRequestVoid(
  path: string,
  options: JsonRequestOptions = {},
): Promise<void> {
  const response = await fetch(`/api/v1${path}`, {
    method: options.method ?? "POST",
    credentials: "include",
    cache: "no-store",
    ...(options.body === undefined
      ? {}
      : {
          headers: {
            "Content-Type": "application/json",
            ...options.headers,
          },
          body: JSON.stringify(options.body),
        }),
    ...(options.body === undefined && options.headers
      ? { headers: options.headers }
      : {}),
  });
  if (response.status === 204) return;
  const payload = await readJson(response);
  if (!response.ok) throw responseError(response.status, payload);
  throw new ApiRequestError(
    response.status,
    "INVALID_RESPONSE",
    "The server returned an unexpected response.",
  );
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  return "The request could not be completed. Please try again.";
}

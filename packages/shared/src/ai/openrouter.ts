import { z } from "zod";

export interface OpenRouterConfig {
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly baseUrl?: string;
  readonly allowNonZdr?: boolean;
  readonly allowDataCollectionFallback?: boolean;
  readonly onDataCollectionFallback?: () => void;
}

export interface StructuredRequest<T> {
  readonly schemaName: string;
  readonly jsonSchema: Record<string, unknown>;
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly validator: z.ZodType<T>;
  readonly onDataCollectionFallback?: () => void;
}

export type OpenRouterProviderFailureReason =
  | "NO_ENDPOINTS_MATCHING_DATA_POLICY"
  | "INSUFFICIENT_CREDITS"
  | "AUTHENTICATION_REJECTED"
  | "STRUCTURED_OUTPUT_REJECTED"
  | "MODEL_REJECTED"
  | "RATE_LIMITED"
  | "PROVIDER_ERROR";

export class OpenRouterError extends Error {
  constructor(
    readonly code:
      | "PROVIDER_UNAVAILABLE"
      | "PROVIDER_RATE_LIMITED"
      | "PROVIDER_REJECTED_REQUEST"
      | "INVALID_PROVIDER_RESPONSE"
      | "INVALID_STRUCTURED_OUTPUT",
    readonly httpStatus?: number,
    readonly providerReason?: OpenRouterProviderFailureReason,
  ) {
    super("The AI provider could not complete this request.");
    this.name = "OpenRouterError";
  }
}

export function parseOpenRouterAllowNonZdr(
  value: string | undefined,
  name = "OPENROUTER_ALLOW_NON_ZDR",
): boolean {
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new Error(`${name} must be either true or false.`);
}

export function assertOpenRouterPrivacySettings(input: {
  readonly model: string;
  readonly allowNonZdr: boolean;
  readonly allowDataCollectionFallback?: boolean | undefined;
  readonly nodeEnv?: string | undefined;
}): void {
  const allowDataCollectionFallback =
    input.allowDataCollectionFallback ?? false;
  if (
    (input.allowNonZdr || allowDataCollectionFallback) &&
    input.nodeEnv === "production"
  ) {
    throw new Error(
      "OpenRouter privacy exceptions are development-only and cannot be enabled in production.",
    );
  }
  if (
    (input.allowNonZdr || allowDataCollectionFallback) &&
    !input.model.endsWith(":free")
  ) {
    throw new Error(
      "OpenRouter privacy exceptions require OPENROUTER_MODEL to use a :free model.",
    );
  }
  if (allowDataCollectionFallback && !input.allowNonZdr) {
    throw new Error(
      "OPENROUTER_ALLOW_DATA_COLLECTION requires OPENROUTER_ALLOW_NON_ZDR=true.",
    );
  }
}

const MAX_RATE_LIMIT_RETRIES = 1;
const MAX_RATE_LIMIT_RETRY_DELAY_MS = 1_000;
const DEFAULT_RATE_LIMIT_RETRY_DELAY_MS = 200;

function boundedRetryDelay(response: Response): number | null {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter === null) return DEFAULT_RATE_LIMIT_RETRY_DELAY_MS;

  const seconds = Number(retryAfter);
  const delayMs = Number.isFinite(seconds)
    ? seconds * 1_000
    : Date.parse(retryAfter) - Date.now();
  if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > MAX_RATE_LIMIT_RETRY_DELAY_MS) {
    return null;
  }
  return delayMs;
}

async function classifyProviderFailure(
  response: Response,
): Promise<OpenRouterProviderFailureReason> {
  if (response.status === 429) return "RATE_LIMITED";

  let message = "";
  try {
    const body: unknown = await response.clone().json();
    if (
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "object" &&
      body.error !== null &&
      "message" in body.error &&
      typeof body.error.message === "string"
    ) {
      message = body.error.message.toLowerCase();
    }
  } catch {
    return "PROVIDER_ERROR";
  }

  if (message.includes("no endpoints") && message.includes("data policy")) {
    return "NO_ENDPOINTS_MATCHING_DATA_POLICY";
  }
  if (message.includes("credit") || message.includes("balance")) {
    return "INSUFFICIENT_CREDITS";
  }
  if (message.includes("key") || message.includes("auth")) {
    return "AUTHENTICATION_REJECTED";
  }
  if (message.includes("schema") || message.includes("response_format")) {
    return "STRUCTURED_OUTPUT_REJECTED";
  }
  if (message.includes("rate limit") || message.includes("too many requests")) {
    return "RATE_LIMITED";
  }
  if (message.includes("model")) return "MODEL_REJECTED";
  return "PROVIDER_ERROR";
}

const CompletionSchema = z
  .object({
    choices: z.array(
      z.object({
        message: z.object({ content: z.string().nullable() }).passthrough(),
      }),
    ),
  })
  .passthrough();

export function createOpenRouterAdapter(
  config: OpenRouterConfig,
  fetcher: typeof fetch = fetch,
) {
  const allowNonZdr = config.allowNonZdr ?? false;
  assertOpenRouterPrivacySettings({
    model: config.model,
    allowNonZdr,
    ...(config.allowDataCollectionFallback === undefined
      ? {}
      : { allowDataCollectionFallback: config.allowDataCollectionFallback }),
  });
  const endpoint = new URL(
    "/api/v1/chat/completions",
    config.baseUrl ?? "https://openrouter.ai",
  );

  return {
    async requestStructuredOutput<T>(request: StructuredRequest<T>): Promise<T> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
      try {
        let dataCollection: "deny" | "allow" = "deny";
        let rateLimitRetries = 0;
        while (true) {
          const response = await fetcher(endpoint, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: config.model,
              messages: [
                { role: "system", content: request.systemPrompt },
                { role: "user", content: request.userPrompt },
              ],
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: request.schemaName,
                  strict: true,
                  schema: request.jsonSchema,
                },
              },
              provider: {
                require_parameters: true,
                data_collection: dataCollection,
                zdr: !allowNonZdr,
              },
            }),
            signal: controller.signal,
          });

          if (response.status === 429) {
            const delayMs =
              rateLimitRetries < MAX_RATE_LIMIT_RETRIES
                ? boundedRetryDelay(response)
                : null;
            if (delayMs !== null) {
              rateLimitRetries += 1;
              await new Promise((resolve) => setTimeout(resolve, delayMs));
              continue;
            }
            throw new OpenRouterError(
              "PROVIDER_RATE_LIMITED",
              response.status,
              "RATE_LIMITED",
            );
          }

          if (!response.ok) {
            const providerReason = await classifyProviderFailure(response);
            if (
              allowNonZdr &&
              config.allowDataCollectionFallback === true &&
              dataCollection === "deny" &&
              providerReason === "NO_ENDPOINTS_MATCHING_DATA_POLICY"
            ) {
              dataCollection = "allow";
              config.onDataCollectionFallback?.();
              request.onDataCollectionFallback?.();
              continue;
            }
            throw new OpenRouterError(
              response.status >= 500
                ? "PROVIDER_UNAVAILABLE"
                : "PROVIDER_REJECTED_REQUEST",
              response.status,
              providerReason,
            );
          }

          let body: unknown;
          try {
            body = await response.json();
          } catch {
            throw new OpenRouterError("INVALID_PROVIDER_RESPONSE");
          }
          const parsedResponse = CompletionSchema.safeParse(body);
          const content = parsedResponse.success
            ? parsedResponse.data.choices[0]?.message.content
            : null;
          if (!content) throw new OpenRouterError("INVALID_PROVIDER_RESPONSE");

          let structured: unknown;
          try {
            structured = JSON.parse(content) as unknown;
          } catch {
            throw new OpenRouterError("INVALID_STRUCTURED_OUTPUT");
          }
          const validated = request.validator.safeParse(structured);
          if (!validated.success) {
            throw new OpenRouterError("INVALID_STRUCTURED_OUTPUT");
          }
          return validated.data;
        }
      } catch (error) {
        if (error instanceof OpenRouterError) throw error;
        throw new OpenRouterError("PROVIDER_UNAVAILABLE");
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

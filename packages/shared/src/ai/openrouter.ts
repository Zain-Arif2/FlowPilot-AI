import { z } from "zod";

export interface OpenRouterConfig {
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly baseUrl?: string;
}

export interface StructuredRequest<T> {
  readonly schemaName: string;
  readonly jsonSchema: Record<string, unknown>;
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly validator: z.ZodType<T>;
}

export class OpenRouterError extends Error {
  constructor(
    readonly code:
      | "PROVIDER_UNAVAILABLE"
      | "PROVIDER_REJECTED_REQUEST"
      | "INVALID_PROVIDER_RESPONSE"
      | "INVALID_STRUCTURED_OUTPUT",
  ) {
    super("The AI provider could not complete this request.");
    this.name = "OpenRouterError";
  }
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
  const endpoint = new URL(
    "/api/v1/chat/completions",
    config.baseUrl ?? "https://openrouter.ai",
  );

  return {
    async requestStructuredOutput<T>(request: StructuredRequest<T>): Promise<T> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
      try {
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
              data_collection: "deny",
              zdr: true,
            },
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new OpenRouterError(
            response.status === 429 || response.status >= 500
              ? "PROVIDER_UNAVAILABLE"
              : "PROVIDER_REJECTED_REQUEST",
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
      } catch (error) {
        if (error instanceof OpenRouterError) throw error;
        throw new OpenRouterError("PROVIDER_UNAVAILABLE");
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

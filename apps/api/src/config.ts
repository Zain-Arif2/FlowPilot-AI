import { z } from "zod";

const EnvironmentSchema = z.object({
  DATABASE_URL: z.string().url(),
  MIGRATION_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  OBJECT_STORAGE_ENDPOINT: z.string().url(),
  OBJECT_STORAGE_REGION: z.string().min(1),
  OBJECT_STORAGE_BUCKET: z.string().min(1),
  OBJECT_STORAGE_ACCESS_KEY: z.string().min(1),
  OBJECT_STORAGE_SECRET_KEY: z.string().min(1),
  OBJECT_STORAGE_PRESIGN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(1)
    .max(900)
    .default(300),
  OPENROUTER_API_KEY: z.string().min(1),
  OPENROUTER_MODEL: z.string().min(1),
  OPENROUTER_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(120_000)
    .default(30_000),
  SESSION_COOKIE_NAME: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .default("flowpilot_session"),
  SESSION_COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  APP_ORIGIN: z.string().url(),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  API_BODY_LIMIT: z
    .string()
    .regex(/^\d+(kb|mb)$/i)
    .default("1mb"),
  API_INTERNAL_URL: z.string().url().default("http://localhost:3001"),
});

export type AppConfig = z.infer<typeof EnvironmentSchema>;

export function readConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvironmentSchema.safeParse(environment);
  if (!parsed.success) {
    const invalidKeys = parsed.error.issues
      .map((issue) => issue.path.join("."))
      .filter((key, index, keys) => keys.indexOf(key) === index)
      .join(", ");
    throw new Error(`Invalid application environment configuration: ${invalidKeys}`);
  }
  return parsed.data;
}

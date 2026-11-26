import { z } from "zod";
import { RedisUrlSchema } from "@flowpilot/shared/redis";

const EnvironmentSchema = z
  .object({
    DATABASE_URL: z.string().url(),
    MIGRATION_URL: z.string().url(),
    REDIS_URL: RedisUrlSchema,
    CLOUDINARY_CLOUD_NAME: z
      .string()
      .min(1)
      .regex(/^[a-zA-Z0-9_-]+$/, "CLOUDINARY_CLOUD_NAME contains invalid characters."),
    CLOUDINARY_API_KEY: z.string().min(1),
    CLOUDINARY_API_SECRET: z.string().min(1),
    CLOUDINARY_SIGNED_URL_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(3_600)
      .default(300),
    DOCUMENT_MAX_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(20_000_000)
      .default(10_000_000),
    OPENROUTER_API_KEY: z.string().min(1),
    OPENROUTER_MODEL: z.string().min(1),
    OPENROUTER_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(120_000)
      .default(30_000),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_ISSUER: z.string().min(1).default("flowpilot-api"),
    JWT_AUDIENCE: z.string().min(1).default("flowpilot-web"),
    JWT_ACCESS_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(600)
      .max(900)
      .default(900),
    JWT_REFRESH_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(604_800)
      .max(2_592_000)
      .default(604_800),
    COOKIE_SECURE: z
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
  })
  .refine((data) => data.JWT_ACCESS_SECRET !== data.JWT_REFRESH_SECRET, {
    path: ["JWT_REFRESH_SECRET"],
    message: "JWT_REFRESH_SECRET must be distinct from JWT_ACCESS_SECRET.",
  });

export type AppConfig = z.infer<typeof EnvironmentSchema>;

export interface AuthCookieNames {
  readonly accessCookieName: string;
  readonly refreshCookieName: string;
}

export function getAuthCookieNames(secure: boolean): AuthCookieNames {
  return secure
    ? {
        accessCookieName: "__Host-flowpilot_access",
        refreshCookieName: "__Host-flowpilot_refresh",
      }
    : {
        accessCookieName: "flowpilot_access",
        refreshCookieName: "flowpilot_refresh",
      };
}

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

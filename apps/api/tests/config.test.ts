import { describe, expect, it } from "vitest";
import { readConfig } from "../src/config.js";

const validEnvironment = {
  DATABASE_URL: "postgresql://app:pass@localhost:5432/flowpilot",
  MIGRATION_URL: "postgresql://migration:pass@localhost:5432/flowpilot",
  REDIS_URL: "redis://localhost:6379",
  CLOUDINARY_CLOUD_NAME: "test-cloud",
  CLOUDINARY_API_KEY: "test-key",
  CLOUDINARY_API_SECRET: "test-secret",
  OPENROUTER_API_KEY: "local-key",
  OPENROUTER_MODEL: "approved/model",
  JWT_ACCESS_SECRET: "test-access-secret-at-least-32-chars-long",
  JWT_REFRESH_SECRET: "test-refresh-secret-at-least-32-chars-long",
  APP_ORIGIN: "https://flowpilot.example",
};

describe("application configuration", () => {
  it("uses the hosting port when provided", () => {
    expect(readConfig({ ...validEnvironment, PORT: "8080" }).API_PORT).toBe(8080);
  });

  it("rejects insecure cookies in production", () => {
    expect(
      readConfig({ ...validEnvironment, NODE_ENV: "production" }).COOKIE_SECURE,
    ).toBe(true);
    expect(() =>
      readConfig({
        ...validEnvironment,
        NODE_ENV: "production",
        COOKIE_SECURE: "false",
      }),
    ).toThrow("COOKIE_SECURE must be true");
  });

  it("caps configured document uploads at 4 MB", () => {
    expect(
      readConfig({ ...validEnvironment, DOCUMENT_MAX_BYTES: "4000000" })
        .DOCUMENT_MAX_BYTES,
    ).toBe(4_000_000);
    expect(() =>
      readConfig({ ...validEnvironment, DOCUMENT_MAX_BYTES: "4000001" }),
    ).toThrow("DOCUMENT_MAX_BYTES");
  });
});

import { describe, expect, it } from "vitest";
import {
  ApiErrorSchema,
  CreateWorkspaceRequestSchema,
  DocumentUploadRequestSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
} from "../src/index.js";

describe("shared request schemas", () => {
  it("normalizes email and rejects unknown registration fields", () => {
    expect(
      RegisterRequestSchema.parse({
        email: "  User@Example.com ",
        password: "correct horse battery",
      }).email,
    ).toBe("user@example.com");
    expect(
      RegisterRequestSchema.safeParse({
        email: "user@example.com",
        password: "correct horse battery",
        isAdmin: true,
      }).success,
    ).toBe(false);
  });

  it("requires a non-empty login password without imposing registration policy", () => {
    expect(
      LoginRequestSchema.safeParse({ email: "a@b.com", password: "x" }).success,
    ).toBe(true);
    expect(
      LoginRequestSchema.safeParse({ email: "a@b.com", password: "" }).success,
    ).toBe(false);
  });

  it("enforces workspace and upload bounds", () => {
    expect(CreateWorkspaceRequestSchema.safeParse({ name: " " }).success).toBe(false);
    expect(
      CreateWorkspaceRequestSchema.safeParse({ name: "x".repeat(121) }).success,
    ).toBe(false);
    expect(
      DocumentUploadRequestSchema.safeParse({
        filename: "file.pdf",
        mediaType: "application/pdf",
        byteSize: 4_000_000,
      }).success,
    ).toBe(true);
    expect(
      DocumentUploadRequestSchema.safeParse({
        filename: "file.pdf",
        mediaType: "application/pdf",
        byteSize: 4_000_001,
      }).success,
    ).toBe(false);
  });

  it("rejects malformed or secret-bearing API error shapes", () => {
    expect(
      ApiErrorSchema.safeParse({
        error: { code: "INTERNAL_ERROR", message: "Failed", requestId: "req-1" },
      }).success,
    ).toBe(true);
    expect(
      ApiErrorSchema.safeParse({
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed",
          requestId: "req-1",
          stack: "private",
        },
      }).success,
    ).toBe(false);
  });
});

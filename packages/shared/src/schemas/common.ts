import { z } from "zod";

export const UuidSchema = z.string().uuid();

export const EmailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());

export const RegisterRequestSchema = z
  .object({
    email: EmailSchema,
    password: z.string().min(12).max(128),
  })
  .strict();

export const LoginRequestSchema = z
  .object({
    email: EmailSchema,
    password: z.string().min(1).max(128),
  })
  .strict();

export const UserSchema = z
  .object({
    id: UuidSchema,
    email: z.string().email(),
  })
  .strict();

export const CreateWorkspaceRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
  })
  .strict();

export const WorkspaceSchema = z
  .object({
    id: UuidSchema,
    ownerId: UuidSchema,
    name: z.string().min(1).max(120),
    createdAt: z.string().datetime(),
  })
  .strict();

export const WorkspaceListSchema = z.array(WorkspaceSchema);

export const ApiErrorCodeSchema = z.enum([
  "INVALID_INPUT",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "SERVICE_UNAVAILABLE",
  "CSRF_FAILED",
  "INTERNAL_ERROR",
]);

export const ApiErrorSchema = z
  .object({
    error: z
      .object({
        code: ApiErrorCodeSchema,
        message: z.string().min(1),
        requestId: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export type ApiError = z.infer<typeof ApiErrorSchema>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type User = z.infer<typeof UserSchema>;
export type CreateWorkspaceRequest = z.infer<typeof CreateWorkspaceRequestSchema>;
export type Workspace = z.infer<typeof WorkspaceSchema>;

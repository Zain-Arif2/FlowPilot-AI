import { Router, type RequestHandler } from "express";
import type { Router as ExpressRouter } from "express";
import {
  LoginRequestSchema,
  RegisterRequestSchema,
  UserSchema,
} from "@flowpilot/shared";
import type { AppConfig } from "../../config.js";
import { HttpError } from "../../errors/api-error.js";
import { sessionCookieOptions } from "../../middleware/session.js";
import type { AuthService } from "../../services/contracts.js";
import { parseInput } from "../../validation.js";
import { AccountAlreadyExistsError } from "@flowpilot/db/repositories";
import { InvalidCredentialsError } from "./service.js";

export function createAuthRouter(
  service: AuthService,
  config: AppConfig,
  authenticate: RequestHandler,
): ExpressRouter {
  const router = Router();

  router.post("/auth/register", async (request, response) => {
    const input = parseInput(RegisterRequestSchema, request.body);
    try {
      const session = await service.register(input);
      response.cookie(
        config.SESSION_COOKIE_NAME,
        session.sessionToken,
        sessionCookieOptions(config.SESSION_COOKIE_SECURE),
      );
      response.status(201).json(UserSchema.parse(session.user));
    } catch (error) {
      if (error instanceof AccountAlreadyExistsError) {
        throw new HttpError(409, "CONFLICT", "An account with this email already exists.");
      }
      throw error;
    }
  });

  router.post("/auth/login", async (request, response) => {
    const input = parseInput(LoginRequestSchema, request.body);
    try {
      const session = await service.login(input);
      response.cookie(
        config.SESSION_COOKIE_NAME,
        session.sessionToken,
        sessionCookieOptions(config.SESSION_COOKIE_SECURE),
      );
      response.status(200).json(UserSchema.parse(session.user));
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        throw new HttpError(401, "UNAUTHENTICATED", "Email or password is incorrect.");
      }
      throw error;
    }
  });

  router.use(authenticate);
  router.post("/auth/logout", async (request, response) => {
    const tokenHash = request.sessionTokenHash;
    if (!tokenHash) throw new HttpError(401, "UNAUTHENTICATED", "Sign-in is required.");
    await service.revokeSession(tokenHash);
    response.clearCookie(config.SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: config.SESSION_COOKIE_SECURE,
      sameSite: "lax",
      path: "/",
    });
    response.status(204).end();
  });

  router.get("/auth/me", (request, response) => {
    if (!request.authUser) {
      throw new HttpError(401, "UNAUTHENTICATED", "Sign-in is required.");
    }
    response.status(200).json(UserSchema.parse(request.authUser));
  });

  return router;
}

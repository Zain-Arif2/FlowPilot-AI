import { Router, type RequestHandler, type Response } from "express";
import type { Router as ExpressRouter } from "express";
import { parse as parseCookies } from "cookie";
import {
  LoginRequestSchema,
  RegisterRequestSchema,
  UserSchema,
} from "@flowpilot/shared";
import { getAuthCookieNames, type AppConfig } from "../../config.js";
import { HttpError } from "../../errors/api-error.js";
import {
  authCookieOptions,
  clearAuthCookieOptions,
} from "../../middleware/auth.js";
import type { AuthService, IssuedAuthTokens } from "../../services/contracts.js";
import { parseInput } from "../../validation.js";
import { AccountAlreadyExistsError } from "@flowpilot/db/repositories";
import { InvalidCredentialsError } from "./service.js";

function setAuthCookies(
  response: Response,
  config: AppConfig,
  tokens: IssuedAuthTokens,
): void {
  const { accessCookieName, refreshCookieName } = getAuthCookieNames(
    config.COOKIE_SECURE,
  );
  response.cookie(
    accessCookieName,
    tokens.accessToken,
    authCookieOptions(config.COOKIE_SECURE, config.JWT_ACCESS_TTL_SECONDS),
  );
  response.cookie(
    refreshCookieName,
    tokens.refreshToken,
    authCookieOptions(config.COOKIE_SECURE, config.JWT_REFRESH_TTL_SECONDS),
  );
}

function clearAuthCookies(response: Response, config: AppConfig): void {
  const { accessCookieName, refreshCookieName } = getAuthCookieNames(
    config.COOKIE_SECURE,
  );
  const options = clearAuthCookieOptions(config.COOKIE_SECURE);
  response.clearCookie(accessCookieName, options);
  response.clearCookie(refreshCookieName, options);
}

export function createAuthRouter(
  service: AuthService,
  config: AppConfig,
  authenticate: RequestHandler,
): ExpressRouter {
  const router = Router();
  const { refreshCookieName } = getAuthCookieNames(config.COOKIE_SECURE);

  router.post("/auth/register", async (request, response) => {
    const input = parseInput(RegisterRequestSchema, request.body);
    try {
      const tokens = await service.register(input);
      setAuthCookies(response, config, tokens);
      response.status(201).json(UserSchema.parse(tokens.user));
    } catch (error) {
      if (error instanceof AccountAlreadyExistsError) {
        throw new HttpError(
          409,
          "CONFLICT",
          "An account with this email already exists.",
        );
      }
      throw error;
    }
  });

  router.post("/auth/login", async (request, response) => {
    const input = parseInput(LoginRequestSchema, request.body);
    try {
      const tokens = await service.login(input);
      setAuthCookies(response, config, tokens);
      response.status(200).json(UserSchema.parse(tokens.user));
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        throw new HttpError(
          401,
          "UNAUTHENTICATED",
          "Email or password is incorrect.",
        );
      }
      throw error;
    }
  });

  router.post("/auth/refresh", async (request, response) => {
    const rawRefreshToken = parseCookies(request.headers.cookie ?? "")[
      refreshCookieName
    ];
    if (!rawRefreshToken) {
      clearAuthCookies(response, config);
      throw new HttpError(401, "UNAUTHENTICATED", "Sign-in is required.");
    }

    const tokens = await service.refresh(rawRefreshToken);
    if (!tokens) {
      clearAuthCookies(response, config);
      throw new HttpError(401, "UNAUTHENTICATED", "Sign-in is required.");
    }

    setAuthCookies(response, config, tokens);
    response.status(200).json(UserSchema.parse(tokens.user));
  });

  router.post("/auth/logout", async (request, response) => {
    const rawRefreshToken = parseCookies(request.headers.cookie ?? "")[
      refreshCookieName
    ];
    await service.logout(rawRefreshToken);
    clearAuthCookies(response, config);
    response.status(204).end();
  });

  router.use(authenticate);
  router.get("/auth/me", (request, response) => {
    if (!request.authUser) {
      throw new HttpError(401, "UNAUTHENTICATED", "Sign-in is required.");
    }
    response.status(200).json(UserSchema.parse(request.authUser));
  });

  return router;
}

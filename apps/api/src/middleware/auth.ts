import type { RequestHandler } from "express";
import { parse as parseCookies } from "cookie";
import { recordRequestTiming } from "@flowpilot/db";
import { HttpError } from "../errors/api-error.js";

export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
}

export type AccessTokenVerifier = (
  rawAccessToken: string,
) => Promise<AuthenticatedUser | null> | AuthenticatedUser | null;

export function createJwtAuthentication(
  verifyAccessToken: AccessTokenVerifier,
  accessCookieName: string,
): RequestHandler {
  return async (request, _response, next) => {
    const rawToken = parseCookies(request.headers.cookie ?? "")[accessCookieName];
    if (!rawToken) {
      next(new HttpError(401, "UNAUTHENTICATED", "Sign-in is required."));
      return;
    }

    const startedAt = performance.now();
    let user: AuthenticatedUser | null;
    try {
      user = await verifyAccessToken(rawToken);
    } finally {
      recordRequestTiming("authDurationMs", performance.now() - startedAt);
    }
    if (!user) {
      next(new HttpError(401, "UNAUTHENTICATED", "Sign-in is required."));
      return;
    }

    request.authUser = user;
    next();
  };
}

export interface AuthCookieOptions {
  readonly httpOnly: true;
  readonly secure: boolean;
  readonly sameSite: "lax";
  readonly path: "/";
  readonly maxAge: number;
}

export function authCookieOptions(
  secure: boolean,
  ttlSeconds: number,
): AuthCookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: ttlSeconds * 1_000,
  };
}

export function clearAuthCookieOptions(secure: boolean) {
  return {
    httpOnly: true as const,
    secure,
    sameSite: "lax" as const,
    path: "/" as const,
  };
}

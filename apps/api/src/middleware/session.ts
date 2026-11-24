import type { RequestHandler } from "express";
import type { PrismaClient } from "@flowpilot/db";
import { parse as parseCookies } from "cookie";
import { HttpError } from "../errors/api-error.js";
import { hashSessionToken } from "../modules/auth/token.js";

export { hashSessionToken } from "../modules/auth/token.js";

export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
}

export type SessionResolver = (tokenHash: string) => Promise<AuthenticatedUser | null>;

export function createSessionAuthentication(
  resolveSession: SessionResolver,
  cookieName: string,
): RequestHandler {
  return async (request, _response, next) => {
    const rawToken = parseCookies(request.headers.cookie ?? "")[cookieName];
    if (!rawToken) {
      next(new HttpError(401, "UNAUTHENTICATED", "Sign-in is required."));
      return;
    }

    const tokenHash = hashSessionToken(rawToken);
    const user = await resolveSession(tokenHash);
    if (!user) {
      next(new HttpError(401, "UNAUTHENTICATED", "Sign-in is required."));
      return;
    }

    request.authUser = user;
    request.sessionTokenHash = tokenHash;
    next();
  };
}

export function createPrismaSessionResolver(client: PrismaClient): SessionResolver {
  return async (tokenHash) => {
    const session = await client.session.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        user: { select: { id: true, email: true } },
      },
    });
    return session?.user ?? null;
  };
}

export interface SessionCookieOptions {
  readonly httpOnly: true;
  readonly secure: boolean;
  readonly sameSite: "lax";
  readonly path: "/";
  readonly maxAge: number;
}

export function sessionCookieOptions(secure: boolean): SessionCookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60 * 1_000,
  };
}

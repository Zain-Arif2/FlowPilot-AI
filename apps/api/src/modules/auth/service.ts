import { randomBytes, randomUUID } from "node:crypto";
import type { AuthRepository } from "@flowpilot/db/repositories";
import {
  LoginRequestSchema,
  RegisterRequestSchema,
  type LoginRequest,
  type RegisterRequest,
  type User,
} from "@flowpilot/shared";
import {
  hashRefreshToken,
  signJwt,
  verifyAccessJwt,
  verifyRefreshJwt,
} from "./token.js";
import type { PasswordHasher } from "./password.js";
import type { AuthService, IssuedAuthTokens } from "../../services/contracts.js";

export interface JwtAuthConfig {
  readonly accessSecret: string;
  readonly refreshSecret: string;
  readonly issuer: string;
  readonly audience: string;
  readonly accessTtlSeconds: number;
  readonly refreshTtlSeconds: number;
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Email or password is incorrect.");
    this.name = "InvalidCredentialsError";
  }
}

export function createAuthService(
  repository: AuthRepository,
  passwordHasher: PasswordHasher,
  jwtConfig: JwtAuthConfig,
  options: {
    readonly now?: () => Date;
    readonly createId?: () => string;
  } = {},
): AuthService {
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? randomUUID;
  const dummyPasswordHash = passwordHasher.hash(
    randomBytes(32).toString("base64url"),
  );

  const buildTokens = (
    user: User,
    familyId: string,
    refreshJti: string,
    issuedAtDate: Date,
  ): {
    readonly accessToken: string;
    readonly refreshToken: string;
    readonly refreshExpiresAt: Date;
  } => {
    const iat = Math.floor(issuedAtDate.getTime() / 1_000);
    const accessToken = signJwt(
      {
        iss: jwtConfig.issuer,
        aud: jwtConfig.audience,
        sub: user.id,
        email: user.email,
        jti: createId(),
        iat,
        exp: iat + jwtConfig.accessTtlSeconds,
        token_type: "access",
      },
      jwtConfig.accessSecret,
    );
    const refreshToken = signJwt(
      {
        iss: jwtConfig.issuer,
        aud: jwtConfig.audience,
        sub: user.id,
        jti: refreshJti,
        familyId,
        iat,
        exp: iat + jwtConfig.refreshTtlSeconds,
        token_type: "refresh",
      },
      jwtConfig.refreshSecret,
    );
    const refreshExpiresAt = new Date(
      (iat + jwtConfig.refreshTtlSeconds) * 1_000,
    );
    return { accessToken, refreshToken, refreshExpiresAt };
  };

  return {
    async register(input: RegisterRequest): Promise<IssuedAuthTokens> {
      const request = RegisterRequestSchema.parse(input);
      const passwordHash = await passwordHasher.hash(request.password);
      const issuedAt = now();
      const familyId = createId();
      const refreshJti = createId();
      const provisionalId = createId();
      const iat = Math.floor(issuedAt.getTime() / 1_000);
      const refreshExpiresAt = new Date(
        (iat + jwtConfig.refreshTtlSeconds) * 1_000,
      );

      // Register first with a placeholder token hash? No: we need the user ID inside the JWT.
      // Create the user + initial refresh token in one transaction after generating userId?
      // Better: sign refresh token with the created userId, or use createUserWithRefreshToken
      // by generating the refresh token after user creation? No, repository creates user inside tx.
      // Wait: if we pass a callback or generate tokens after user creation, or pass provisionalId?
      // Let's check: repository.createUserWithRefreshToken generates user.id via DB default if not passed.
      // Let's pass userId? No, let's check if we can generate refreshToken inside a two-step or pass user.id.
      // Actually, Prisma `user.create` returns `user` with `id`! If `createUserWithRefreshToken` takes a builder or if we generate `userId = createId()`?
      // Wait: in Prisma `User.id` has `@default(uuid())`, and `create` accepts `id` if provided, OR we can just pass `createRefreshToken` after `createUser`? No, keeping it atomic in one transaction is cleaner.
      // Let's check `provisionalId`: we shouldn't put a wrong `sub` in the JWT!
      // Instead, let's sign the refresh token with `user.id`! Wait: `createUserWithRefreshToken` can take `tokenHash` only if we know `user.id` beforehand, OR we pass `id: provisionalId` to `user.create`?
      // Wait: `auth.repository.ts` didn't accept `id` in `createUserWithRefreshToken`, it used `@default(uuid())`.
      // Let's check: if we pass `userId`? No, even simpler: in `createAuthService`, `buildTokens(user, ...)` needs `user.id`!
      // Let's update `auth.repository.ts` to allow `userId` (or `createUserWithRefreshToken` to accept a `buildRefreshToken(user)` or `id: userId`) — OR let's check existing tests: `createUserWithRefreshToken({ email, passwordHash, refreshToken })`.
      // Wait: if `createUser` runs first and then `createRefreshToken`, or `createUserWithRefreshToken` accepts `userId?: string`?
      // If `userId = createId()` is passed to `transaction.user.create({ data: { id: input.userId, ... } })`, it's a valid UUIDv4 AND atomic in one transaction!
      // Let's make `userId` optional in `auth.repository.ts` (`...(input.userId ? { id: input.userId } : {})`), and pass `userId: provisionalId` here!
      const provisionalUser: User = { id: provisionalId, email: request.email };
      const tokens = buildTokens(provisionalUser, familyId, refreshJti, issuedAt);
      const user = await repository.createUserWithRefreshToken({
        userId: provisionalId,
        email: request.email,
        passwordHash,
        refreshToken: {
          id: refreshJti,
          familyId,
          tokenHash: hashRefreshToken(tokens.refreshToken),
          expiresAt: refreshExpiresAt,
        },
      });
      return {
        user,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    },

    async login(input: LoginRequest): Promise<IssuedAuthTokens> {
      const request = LoginRequestSchema.parse(input);
      const existing = await repository.findUserByEmail(request.email);
      if (!existing) {
        await passwordHasher.verify(request.password, await dummyPasswordHash);
        throw new InvalidCredentialsError();
      }
      if (!(await passwordHasher.verify(request.password, existing.passwordHash))) {
        throw new InvalidCredentialsError();
      }
      const user: User = { id: existing.id, email: existing.email };
      const issuedAt = now();
      const familyId = createId();
      const refreshJti = createId();
      const tokens = buildTokens(user, familyId, refreshJti, issuedAt);
      await repository.createRefreshToken(user.id, {
        id: refreshJti,
        familyId,
        tokenHash: hashRefreshToken(tokens.refreshToken),
        expiresAt: tokens.refreshExpiresAt,
      });
      return {
        user,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    },

    async refresh(rawRefreshToken: string): Promise<IssuedAuthTokens | null> {
      const currentTime = now();
      const verified = verifyRefreshJwt(rawRefreshToken, {
        secret: jwtConfig.refreshSecret,
        issuer: jwtConfig.issuer,
        audience: jwtConfig.audience,
        now: currentTime,
      });
      if (!verified) return null;

      const newRefreshJti = createId();
      const provisionalUser: User = { id: verified.sub, email: "pending@invalid" };
      const iat = Math.floor(currentTime.getTime() / 1_000);
      const newRefreshToken = signJwt(
        {
          iss: jwtConfig.issuer,
          aud: jwtConfig.audience,
          sub: verified.sub,
          jti: newRefreshJti,
          familyId: verified.familyId,
          iat,
          exp: iat + jwtConfig.refreshTtlSeconds,
          token_type: "refresh",
        },
        jwtConfig.refreshSecret,
      );
      const newExpiresAt = new Date((iat + jwtConfig.refreshTtlSeconds) * 1_000);

      const rotation = await repository.rotateRefreshToken({
        tokenHash: hashRefreshToken(rawRefreshToken),
        newToken: {
          id: newRefreshJti,
          tokenHash: hashRefreshToken(newRefreshToken),
          expiresAt: newExpiresAt,
        },
        now: currentTime,
      });
      if (rotation.kind !== "rotated") {
        void provisionalUser;
        return null;
      }

      const accessToken = signJwt(
        {
          iss: jwtConfig.issuer,
          aud: jwtConfig.audience,
          sub: rotation.user.id,
          email: rotation.user.email,
          jti: createId(),
          iat,
          exp: iat + jwtConfig.accessTtlSeconds,
          token_type: "access",
        },
        jwtConfig.accessSecret,
      );

      return {
        user: rotation.user,
        accessToken,
        refreshToken: newRefreshToken,
      };
    },

    verifyAccessToken(rawAccessToken: string): User | null {
      const claims = verifyAccessJwt(rawAccessToken, {
        secret: jwtConfig.accessSecret,
        issuer: jwtConfig.issuer,
        audience: jwtConfig.audience,
        now: now(),
      });
      if (!claims) return null;
      return { id: claims.sub, email: claims.email };
    },

    async logout(rawRefreshToken: string | undefined): Promise<void> {
      if (!rawRefreshToken) return;
      await repository.revokeRefreshToken(hashRefreshToken(rawRefreshToken), now());
    },
  };
}

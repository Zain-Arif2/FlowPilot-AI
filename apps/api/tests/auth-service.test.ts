import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createAuthRepository } from "@flowpilot/db/repositories";
import {
  createAuthService,
  InvalidCredentialsError,
} from "../src/modules/auth/service.js";
import {
  hashRefreshToken,
  signJwt,
  verifyAccessJwt,
  verifyRefreshJwt,
} from "../src/modules/auth/token.js";
import type { PasswordHasher } from "../src/modules/auth/password.js";

const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "person@example.com",
};

const jwtConfig = {
  accessSecret: "test-access-secret-at-least-32-chars-long",
  refreshSecret: "test-refresh-secret-at-least-32-chars-long",
  issuer: "flowpilot-api",
  audience: "flowpilot-web",
  accessTtlSeconds: 900,
  refreshTtlSeconds: 604_800,
};

function createHarness() {
  let currentTime = new Date("2026-11-24T00:00:00.000Z");
  const users: Array<{ id: string; email: string; passwordHash: string }> = [
    { id: user.id, email: user.email, passwordHash: "stored-password-hash" },
  ];
  const refreshTokens: Array<{
    id: string;
    userId: string;
    familyId: string;
    tokenHash: string;
    expiresAt: Date;
    revokedAt: Date | null;
    replacedBy: string | null;
  }> = [];

  const tx = {
    user: {
      async create(args: {
        data: { id?: string; email: string; passwordHash: string };
      }) {
        const created = {
          id: args.data.id ?? randomUUID(),
          email: args.data.email,
          passwordHash: args.data.passwordHash,
        };
        users.push(created);
        return { id: created.id, email: created.email };
      },
    },
    refreshToken: {
      async create(args: {
        data: {
          id: string;
          userId: string;
          familyId: string;
          tokenHash: string;
          expiresAt: Date;
        };
      }) {
        const record = {
          ...args.data,
          revokedAt: null,
          replacedBy: null,
        };
        refreshTokens.push(record);
        return record;
      },
      async findUnique(args: { where: { tokenHash: string } }) {
        const record = refreshTokens.find(
          (item) => item.tokenHash === args.where.tokenHash,
        );
        if (!record) return null;
        const owner = users.find((item) => item.id === record.userId);
        if (!owner) return null;
        return {
          ...record,
          user: { id: owner.id, email: owner.email },
        };
      },
      async updateMany(args: {
        where: {
          id?: string;
          familyId?: string;
          revokedAt?: null;
          replacedBy?: null;
        };
        data: { revokedAt?: Date; replacedBy?: string };
      }) {
        let count = 0;
        for (const item of refreshTokens) {
          if (args.where.id && item.id !== args.where.id) continue;
          if (args.where.familyId && item.familyId !== args.where.familyId) {
            continue;
          }
          if (args.where.revokedAt === null && item.revokedAt !== null) continue;
          if (args.where.replacedBy === null && item.replacedBy !== null) continue;
          Object.assign(item, args.data);
          count += 1;
        }
        return { count };
      },
    },
  };

  const prisma = {
    async $transaction<T>(fn: (transaction: typeof tx) => Promise<T>) {
      return fn(tx);
    },
    user: {
      async findUnique(args: { where: { email: string } }) {
        return users.find((item) => item.email === args.where.email) ?? null;
      },
    },
    refreshToken: tx.refreshToken,
  } as unknown as PrismaClient;

  const passwordHasher: PasswordHasher = {
    hash: vi.fn(async (password) => `hashed:${password}`),
    verify: vi.fn(
      async (password, passwordHash) =>
        passwordHash === "stored-password-hash"
          ? password === "correct horse battery"
          : passwordHash === `hashed:${password}`,
    ),
  };

  const service = createAuthService(
    createAuthRepository(prisma),
    passwordHasher,
    jwtConfig,
    { now: () => currentTime },
  );

  return {
    service,
    passwordHasher,
    refreshTokens,
    advanceSeconds(seconds: number) {
      currentTime = new Date(currentTime.getTime() + seconds * 1_000);
    },
  };
}

describe("JWT authentication service", () => {
  it("registers a user, issues access and refresh JWTs, and stores only the refresh token hash", async () => {
    const harness = createHarness();
    const result = await harness.service.register({
      email: "NewUser@Example.com",
      password: "correct horse battery",
    });

    expect(result.user.email).toBe("newuser@example.com");
    expect(harness.refreshTokens).toHaveLength(1);
    expect(harness.refreshTokens[0]?.tokenHash).toBe(
      hashRefreshToken(result.refreshToken),
    );
    expect(harness.refreshTokens[0]?.tokenHash).not.toBe(result.refreshToken);

    const accessClaims = verifyAccessJwt(result.accessToken, {
      secret: jwtConfig.accessSecret,
      issuer: jwtConfig.issuer,
      audience: jwtConfig.audience,
      now: new Date("2026-11-24T00:00:00.000Z"),
    });
    expect(accessClaims).toMatchObject({
      sub: result.user.id,
      email: "newuser@example.com",
      token_type: "access",
    });

    const refreshClaims = verifyRefreshJwt(result.refreshToken, {
      secret: jwtConfig.refreshSecret,
      issuer: jwtConfig.issuer,
      audience: jwtConfig.audience,
      now: new Date("2026-11-24T00:00:00.000Z"),
    });
    expect(refreshClaims).toMatchObject({
      sub: result.user.id,
      token_type: "refresh",
      familyId: harness.refreshTokens[0]?.familyId,
    });
  });

  it("verifies access JWTs and rejects expired, tampered, or refresh tokens", async () => {
    const harness = createHarness();
    const issued = await harness.service.login({
      email: user.email,
      password: "correct horse battery",
    });

    expect(harness.service.verifyAccessToken(issued.accessToken)).toEqual(user);
    expect(harness.service.verifyAccessToken(issued.refreshToken)).toBeNull();
    expect(harness.service.verifyAccessToken(`${issued.accessToken}tamper`)).toBeNull();

    const wrongIssuer = signJwt(
      {
        iss: "other-issuer",
        aud: jwtConfig.audience,
        sub: user.id,
        email: user.email,
        jti: randomUUID(),
        iat: Math.floor(new Date("2026-11-24T00:00:00.000Z").getTime() / 1_000),
        exp:
          Math.floor(new Date("2026-11-24T00:00:00.000Z").getTime() / 1_000) +
          900,
        token_type: "access",
      },
      jwtConfig.accessSecret,
    );
    expect(harness.service.verifyAccessToken(wrongIssuer)).toBeNull();

    harness.advanceSeconds(901);
    expect(harness.service.verifyAccessToken(issued.accessToken)).toBeNull();
  });

  it("rotates refresh tokens and revokes the entire family on reuse detection", async () => {
    const harness = createHarness();
    const initial = await harness.service.login({
      email: user.email,
      password: "correct horse battery",
    });

    harness.advanceSeconds(60);
    const rotated = await harness.service.refresh(initial.refreshToken);
    expect(rotated).not.toBeNull();
    expect(rotated?.refreshToken).not.toBe(initial.refreshToken);
    expect(harness.refreshTokens).toHaveLength(2);
    expect(harness.refreshTokens[0]?.revokedAt).not.toBeNull();
    expect(harness.refreshTokens[0]?.replacedBy).toBe(
      harness.refreshTokens[1]?.id,
    );

    // Replaying the already-rotated initial refresh token triggers reuse detection.
    const replay = await harness.service.refresh(initial.refreshToken);
    expect(replay).toBeNull();
    // Entire family is now revoked, so even the latest rotated token is rejected.
    expect(
      await harness.service.refresh(rotated?.refreshToken ?? ""),
    ).toBeNull();
  });

  it("revokes the refresh token family on logout and rejects expired refresh tokens", async () => {
    const harness = createHarness();
    const issued = await harness.service.login({
      email: user.email,
      password: "correct horse battery",
    });

    await harness.service.logout(issued.refreshToken);
    expect(await harness.service.refresh(issued.refreshToken)).toBeNull();

    const secondLogin = await harness.service.login({
      email: user.email,
      password: "correct horse battery",
    });
    harness.advanceSeconds(604_801);
    expect(await harness.service.refresh(secondLogin.refreshToken)).toBeNull();
  });

  it("returns one credential error for missing users and incorrect passwords", async () => {
    const harness = createHarness();
    const attempts = [
      harness.service.login({
        email: "absent@example.com",
        password: "incorrect password",
      }),
      harness.service.login({
        email: user.email,
        password: "incorrect password",
      }),
    ];

    for (const attempt of attempts) {
      await expect(attempt).rejects.toBeInstanceOf(InvalidCredentialsError);
    }
  });
});

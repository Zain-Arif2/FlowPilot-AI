import { describe, expect, it, vi } from "vitest";
import type { AuthRepository } from "@flowpilot/db/repositories";
import { hashSessionToken } from "../src/modules/auth/token.js";
import {
  createAuthService,
  InvalidCredentialsError,
} from "../src/modules/auth/service.js";
import type { PasswordHasher } from "../src/modules/auth/password.js";

const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "person@example.com",
};
const fixedNow = new Date("2026-11-24T00:00:00.000Z");

function createHarness() {
  const sessions: Array<{ tokenHash: string; expiresAt: Date }> = [];
  const repository: AuthRepository = {
    async createUserWithSession(input) {
      sessions.push(input.session);
      return { id: user.id, email: input.email };
    },
    async findUserByEmail(email) {
      if (email === "absent@example.com") return null;
      return { ...user, email, passwordHash: "stored-password-hash" };
    },
    async createSession(_userId, session) {
      sessions.push(session);
    },
    async findActiveSession() {
      return user;
    },
    async revokeSession() {},
  };
  const passwordHasher: PasswordHasher = {
    hash: vi.fn(async (password) => `hashed:${password}`),
    verify: vi.fn(
      async (password, passwordHash) =>
        passwordHash === "stored-password-hash"
          ? password === "correct horse battery"
          : passwordHash === `hashed:${password}`,
    ),
  };
  let tokenNumber = 0;
  const service = createAuthService(repository, passwordHasher, {
    now: () => fixedNow,
    createToken: () => `opaque-token-${++tokenNumber}`,
  });
  return { service, repository, passwordHasher, sessions };
}

describe("authentication service", () => {
  it("stores only a SHA-256 token hash and applies the configured session lifetime", async () => {
    const { service, sessions } = createHarness();
    const result = await service.register({
      email: "Person@Example.com",
      password: "correct horse battery",
    });

    expect(result.user.email).toBe("person@example.com");
    expect(result.sessionToken).toBe("opaque-token-1");
    expect(sessions).toEqual([
      {
        tokenHash: hashSessionToken("opaque-token-1"),
        expiresAt: new Date(fixedNow.getTime() + 30 * 24 * 60 * 60 * 1_000),
      },
    ]);
  });

  it("issues sessions only after verifying the stored password hash", async () => {
    const { service, sessions, passwordHasher } = createHarness();
    const result = await service.login({
      email: user.email,
      password: "correct horse battery",
    });

    expect(result.user).toEqual(user);
    expect(result.sessionToken).toBe("opaque-token-1");
    expect(passwordHasher.verify).toHaveBeenCalledWith(
      "correct horse battery",
      "stored-password-hash",
    );
    expect(sessions[0]?.tokenHash).toBe(hashSessionToken(result.sessionToken));
  });

  it("returns one credential error for missing users and incorrect passwords", async () => {
    const { service } = createHarness();
    const attempts = [
      service.login({ email: "absent@example.com", password: "incorrect password" }),
      service.login({ email: user.email, password: "incorrect password" }),
    ];

    for (const attempt of attempts) {
      await expect(attempt).rejects.toBeInstanceOf(InvalidCredentialsError);
    }
  });
});

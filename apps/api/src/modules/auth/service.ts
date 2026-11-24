import { randomBytes } from "node:crypto";
import type { AuthRepository } from "@flowpilot/db/repositories";
import {
  LoginRequestSchema,
  RegisterRequestSchema,
  type LoginRequest,
  type RegisterRequest,
  type User,
} from "@flowpilot/shared";
import { hashSessionToken } from "./token.js";
import type { PasswordHasher } from "./password.js";
import type { AuthService, IssuedSession } from "../../services/contracts.js";

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Email or password is incorrect.");
    this.name = "InvalidCredentialsError";
  }
}

export function createAuthService(
  repository: AuthRepository,
  passwordHasher: PasswordHasher,
  options: {
    readonly now?: () => Date;
    readonly createToken?: () => string;
  } = {},
): AuthService {
  const now = options.now ?? (() => new Date());
  const createToken =
    options.createToken ?? (() => randomBytes(32).toString("base64url"));
  const dummyPasswordHash = passwordHasher.hash(
    randomBytes(32).toString("base64url"),
  );

  const issueSession = async (
    user: User,
    persist: (tokenHash: string, expiresAt: Date) => Promise<void>,
  ): Promise<IssuedSession> => {
    const sessionToken = createToken();
    const expiresAt = new Date(now().getTime() + SESSION_LIFETIME_MS);
    await persist(hashSessionToken(sessionToken), expiresAt);
    return { user, sessionToken };
  };

  return {
    async register(input: RegisterRequest): Promise<IssuedSession> {
      const request = RegisterRequestSchema.parse(input);
      const passwordHash = await passwordHasher.hash(request.password);
      const sessionToken = createToken();
      const expiresAt = new Date(now().getTime() + SESSION_LIFETIME_MS);
      const user = await repository.createUserWithSession({
        email: request.email,
        passwordHash,
        session: { tokenHash: hashSessionToken(sessionToken), expiresAt },
      });
      return { user, sessionToken };
    },

    async login(input: LoginRequest): Promise<IssuedSession> {
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
      return issueSession(user, (tokenHash, expiresAt) =>
        repository.createSession(existing.id, { tokenHash, expiresAt }),
      );
    },

    resolveSession(tokenHash) {
      return repository.findActiveSession(tokenHash, now());
    },

    revokeSession(tokenHash) {
      return repository.revokeSession(tokenHash, now());
    },
  };
}

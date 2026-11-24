import { Prisma, type PrismaClient } from "@prisma/client";

export interface NewSession {
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

export class AccountAlreadyExistsError extends Error {
  constructor() {
    super("An account with this email already exists.");
    this.name = "AccountAlreadyExistsError";
  }
}

export function createAuthRepository(client: PrismaClient) {
  return {
    async createUserWithSession(input: {
      readonly email: string;
      readonly passwordHash: string;
      readonly session: NewSession;
    }) {
      try {
        return await client.$transaction(async (transaction) => {
          const user = await transaction.user.create({
            data: {
              email: input.email,
              passwordHash: input.passwordHash,
            },
            select: { id: true, email: true },
          });
          await transaction.session.create({
            data: { userId: user.id, ...input.session },
          });
          return user;
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new AccountAlreadyExistsError();
        }
        throw error;
      }
    },

    async findUserByEmail(email: string) {
      return client.user.findUnique({
        where: { email },
        select: { id: true, email: true, passwordHash: true },
      });
    },

    async createSession(userId: string, session: NewSession): Promise<void> {
      await client.session.create({
        data: { userId, ...session },
      });
    },

    async findActiveSession(tokenHash: string, now: Date) {
      const session = await client.session.findFirst({
        where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
        select: { user: { select: { id: true, email: true } } },
      });
      return session?.user ?? null;
    },

    async revokeSession(tokenHash: string, revokedAt: Date): Promise<void> {
      await client.session.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt },
      });
    },
  };
}

export type AuthRepository = ReturnType<typeof createAuthRepository>;

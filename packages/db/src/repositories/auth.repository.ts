import { Prisma, type PrismaClient } from "@prisma/client";

const REFRESH_ROTATION_TRANSACTION_OPTIONS = { timeout: 20_000 } as const;

export interface NewRefreshToken {
  readonly id: string;
  readonly familyId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

export type RotateRefreshTokenResult =
  | {
      readonly kind: "rotated";
      readonly user: { readonly id: string; readonly email: string };
      readonly familyId: string;
    }
  | { readonly kind: "invalid" }
  | { readonly kind: "expired" }
  | { readonly kind: "reused"; readonly familyId: string };

export class AccountAlreadyExistsError extends Error {
  constructor() {
    super("An account with this email already exists.");
    this.name = "AccountAlreadyExistsError";
  }
}

export function createAuthRepository(client: PrismaClient) {
  return {
    async createUserWithRefreshToken(input: {
      readonly userId?: string;
      readonly email: string;
      readonly passwordHash: string;
      readonly refreshToken: NewRefreshToken;
    }) {
      try {
        return await client.$transaction(async (transaction) => {
          const user = await transaction.user.create({
            data: {
              ...(input.userId ? { id: input.userId } : {}),
              email: input.email,
              passwordHash: input.passwordHash,
            },
            select: { id: true, email: true },
          });
          await transaction.refreshToken.create({
            data: {
              id: input.refreshToken.id,
              userId: user.id,
              familyId: input.refreshToken.familyId,
              tokenHash: input.refreshToken.tokenHash,
              expiresAt: input.refreshToken.expiresAt,
            },
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

    async createRefreshToken(
      userId: string,
      refreshToken: NewRefreshToken,
    ): Promise<void> {
      await client.refreshToken.create({
        data: {
          id: refreshToken.id,
          userId,
          familyId: refreshToken.familyId,
          tokenHash: refreshToken.tokenHash,
          expiresAt: refreshToken.expiresAt,
        },
      });
    },

    async rotateRefreshToken(input: {
      readonly tokenHash: string;
      readonly newToken: {
        readonly id: string;
        readonly tokenHash: string;
        readonly expiresAt: Date;
      };
      readonly now: Date;
    }): Promise<RotateRefreshTokenResult> {
      return client.$transaction(
        async (transaction) => {
          const existing = await transaction.refreshToken.findUnique({
            where: { tokenHash: input.tokenHash },
            select: {
              id: true,
              userId: true,
              familyId: true,
              expiresAt: true,
              revokedAt: true,
              replacedBy: true,
              user: { select: { id: true, email: true } },
            },
          });
          if (!existing) {
            return { kind: "invalid" };
          }
          if (existing.revokedAt !== null || existing.replacedBy !== null) {
            await transaction.refreshToken.updateMany({
              where: { familyId: existing.familyId, revokedAt: null },
              data: { revokedAt: input.now },
            });
            return { kind: "reused", familyId: existing.familyId };
          }
          if (existing.expiresAt <= input.now) {
            return { kind: "expired" };
          }

          const claimed = await transaction.refreshToken.updateMany({
            where: {
              id: existing.id,
              revokedAt: null,
              replacedBy: null,
            },
            data: {
              revokedAt: input.now,
              replacedBy: input.newToken.id,
            },
          });
          if (claimed.count !== 1) {
            await transaction.refreshToken.updateMany({
              where: { familyId: existing.familyId, revokedAt: null },
              data: { revokedAt: input.now },
            });
            return { kind: "reused", familyId: existing.familyId };
          }

          await transaction.refreshToken.create({
            data: {
              id: input.newToken.id,
              userId: existing.userId,
              familyId: existing.familyId,
              tokenHash: input.newToken.tokenHash,
              expiresAt: input.newToken.expiresAt,
            },
          });
          return {
            kind: "rotated",
            user: existing.user,
            familyId: existing.familyId,
          };
        },
        REFRESH_ROTATION_TRANSACTION_OPTIONS,
      );
    },

    async revokeRefreshToken(tokenHash: string, revokedAt: Date): Promise<void> {
      await client.$transaction(async (transaction) => {
        const existing = await transaction.refreshToken.findUnique({
          where: { tokenHash },
          select: { familyId: true },
        });
        if (!existing) return;
        await transaction.refreshToken.updateMany({
          where: { familyId: existing.familyId, revokedAt: null },
          data: { revokedAt },
        });
      });
    },

    async revokeRefreshTokenFamily(
      familyId: string,
      revokedAt: Date,
    ): Promise<void> {
      await client.refreshToken.updateMany({
        where: { familyId, revokedAt: null },
        data: { revokedAt },
      });
    },
  };
}

export type AuthRepository = ReturnType<typeof createAuthRepository>;

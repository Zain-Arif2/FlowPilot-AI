import type { Prisma } from "@flowpilot/db";

declare global {
  namespace Express {
    interface Request {
      authUser?: {
        readonly id: string;
        readonly email: string;
      };
      sessionTokenHash?: string;
      workspaceContext?: {
        readonly userId: string;
        readonly workspaceId: string;
      };
      tenantTransaction?: Prisma.TransactionClient;
    }
  }
}

export {};

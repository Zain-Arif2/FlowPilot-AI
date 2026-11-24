import { PrismaClient } from "@prisma/client";
export { PrismaClient };
export type {
  DocumentMediaType,
  DocumentStatus,
  ExecutionStatus,
  OutboxEvent,
  Prisma,
  StepStatus,
} from "@prisma/client";

function getApplicationDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl)
    throw new Error("DATABASE_URL is required for application database access.");
  return databaseUrl;
}

const globalForPrisma = globalThis as typeof globalThis & {
  flowPilotPrisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.flowPilotPrisma ??
  new PrismaClient({
    datasources: { db: { url: getApplicationDatabaseUrl() } },
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.flowPilotPrisma = prisma;
}

export type DatabaseClient = typeof prisma;

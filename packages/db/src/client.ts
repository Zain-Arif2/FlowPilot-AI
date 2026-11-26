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

function createPrismaClient() {
  return new PrismaClient({
    datasources: { db: { url: getApplicationDatabaseUrl() } },
    log: ["error"],
  });
}

const globalForPrisma = globalThis as typeof globalThis & {
  flowPilotPrisma?: ReturnType<typeof createPrismaClient>;
};

export const prisma = globalForPrisma.flowPilotPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.flowPilotPrisma = prisma;
}

export type DatabaseClient = typeof prisma;

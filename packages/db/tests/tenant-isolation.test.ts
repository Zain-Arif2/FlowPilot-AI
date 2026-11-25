import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/client.js";
import { withTenantTransaction } from "../src/tenant-transaction.js";

const databaseUrl = process.env.DATABASE_URL;
const migrationUrl = process.env.MIGRATION_URL;
if (!databaseUrl || !migrationUrl) {
  throw new Error(
    "Tenant integration tests require dedicated non-production database URLs; apply migrations before running.",
  );
}

const migrationClient = new PrismaClient({
  datasources: { db: { url: migrationUrl } },
});
const ownerId = randomUUID();
const workspaceOneId = randomUUID();
const workspaceTwoId = randomUUID();
const documentId = randomUUID();
const workflowTwoId = randomUUID();

beforeAll(async () => {
  await migrationClient.user.create({
    data: {
      id: ownerId,
      email: `${ownerId}@integration.invalid`,
      passwordHash: "test-only-hash",
    },
  });
  await migrationClient.workspace.createMany({
    data: [
      { id: workspaceOneId, ownerId, name: "RLS test one" },
      { id: workspaceTwoId, ownerId, name: "RLS test two" },
    ],
  });
  await migrationClient.document.create({
    data: {
      id: documentId,
      workspaceId: workspaceOneId,
      uploadedById: ownerId,
      originalName: "synthetic.pdf",
      mediaType: "pdf",
      byteSize: 1,
      sourceObjectKey: `integration/${documentId}`,
      checksum: "test-checksum",
    },
  });
  await migrationClient.workflow.create({
    data: {
      id: workflowTwoId,
      workspaceId: workspaceTwoId,
      name: "Other workspace workflow",
      definitionVersion: 1,
      definition: { version: 1, nodes: [], edges: [] },
    },
  });
});

afterAll(async () => {
  await migrationClient.workspace.deleteMany({
    where: { id: { in: [workspaceOneId, workspaceTwoId] } },
  });
  await migrationClient.user.deleteMany({ where: { id: ownerId } });
  await migrationClient.$disconnect();
  await prisma.$disconnect();
});

describe("PostgreSQL tenant isolation", () => {
  it("denies workspace data when tenant context is missing", async () => {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*)::bigint AS count FROM "Document" WHERE "id" = ${documentId}::uuid
    `;
    expect(rows[0]?.count).toBe(0n);
  });

  it("rejects a workspace context that does not match its owner", async () => {
    await expect(
      withTenantTransaction(
        prisma,
        { userId: randomUUID(), workspaceId: workspaceOneId },
        async (transaction) => transaction.document.findMany(),
      ),
    ).rejects.toThrow("cannot access this workspace");
  });

  it("rejects a relation that crosses workspace boundaries at the database layer", async () => {
    await expect(
      migrationClient.execution.create({
        data: {
          workspaceId: workspaceOneId,
          workflowId: workflowTwoId,
          createdById: ownerId,
          workflowRevision: 1,
          workflowSnapshot: { version: 1, nodes: [], edges: [] },
          idempotencyKey: randomUUID(),
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });
});

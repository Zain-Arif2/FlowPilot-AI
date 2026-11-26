import { describe, expect, it, vi } from "vitest";
import { createCleanupProcessor } from "../src/processors/cleanup.processor.js";

const userId = "00000000-0000-4000-8000-000000000001";
const workspaceId = "00000000-0000-4000-8000-000000000002";
const aggregateId = "00000000-0000-4000-8000-000000000003";

describe("cleanup processor", () => {
  it("deletes all document objects before purging the deleting row", async () => {
    const calls: string[] = [];
    const documents = {
      async findById() {
        return { id: aggregateId, status: "deleting" };
      },
      async completeDeletion() {
        calls.push("purge");
      },
    };
    const storage = {
      async deletePrefix(prefix: string) {
        calls.push(`delete:${prefix}`);
      },
      async deleteObject() {
        calls.push("delete-object");
      },
    };
    const processor = createCleanupProcessor(
      documents,
      {
        async listForExecution() {
          return [];
        },
        async deleteForExecution() {
          return { count: 0 };
        },
      },
      storage,
    );

    await processor({
      cleanupType: "document",
      aggregateId,
      workspaceId,
      userId,
    });

    expect(calls).toEqual([
      `delete:flowpilot/workspaces/${workspaceId}/documents/${aggregateId}/`,
      "purge",
    ]);
  });

  it("does not delete storage unless the document is in deleting state", async () => {
    const deletePrefix = vi.fn();
    const completeDeletion = vi.fn();
    const processor = createCleanupProcessor(
      {
        async findById() {
          return { id: aggregateId, status: "ready" };
        },
        completeDeletion,
      },
      {
        async listForExecution() {
          return [];
        },
        async deleteForExecution() {
          return { count: 0 };
        },
      },
      { deletePrefix, async deleteObject() {} },
    );

    await processor({
      cleanupType: "document",
      aggregateId,
      workspaceId,
      userId,
    });

    expect(deletePrefix).not.toHaveBeenCalled();
    expect(completeDeletion).not.toHaveBeenCalled();
  });

  it("removes execution artifact objects before deleting their references", async () => {
    const calls: string[] = [];
    const processor = createCleanupProcessor(
      {
        async findById() {
          return null;
        },
        async completeDeletion() {},
      },
      {
        async listForExecution() {
          return [
            { publicId: "private/artifact-a" },
            { publicId: "private/artifact-b" },
          ];
        },
        async deleteForExecution() {
          calls.push("delete-references");
          return { count: 2 };
        },
      },
      {
        async deleteObject(key: string) {
          calls.push(`delete:${key}`);
        },
        async deletePrefix() {},
      },
    );

    await processor({
      cleanupType: "execution_artifacts",
      aggregateId,
      workspaceId,
      userId,
    });

    expect(calls).toEqual([
      "delete:private/artifact-a",
      "delete:private/artifact-b",
      "delete-references",
    ]);
  });
});

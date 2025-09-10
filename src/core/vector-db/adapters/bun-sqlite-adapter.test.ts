import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { VectorDBAdapter, VectorDocument } from "./types.js";

// Dynamic import to check if bun:sqlite is available
const isBunRuntime = typeof Bun !== "undefined";

describe.skipIf(!isBunRuntime)("createBunSQLiteAdapter", () => {
  let adapter: VectorDBAdapter;
  const testConfig = {
    provider: "bun-sqlite" as const,
    options: {
      path: ":memory:",
      dimension: 3,
    },
  };

  beforeEach(async () => {
    if (isBunRuntime) {
      // Dynamically import the adapter when running in Bun
      const { createBunSQLiteAdapter } = await import(
        "./bun-sqlite-adapter.js"
      );
      adapter = createBunSQLiteAdapter(testConfig);
      await adapter.initialize();
    }
  });

  afterEach(async () => {
    if (adapter) {
      await adapter.close();
    }
  });

  it("should initialize the database", async () => {
    const info = adapter.getInfo();
    expect(info.provider).toBe("bun-sqlite");
    expect(info.capabilities).toContain("vector-search");
  });

  it("should insert and retrieve a document", async () => {
    const doc: VectorDocument = {
      id: "test-1",
      content: "Test content",
      embedding: [0.1, 0.2, 0.3],
      metadata: { key: "value" },
    };

    const id = await adapter.insert(doc);
    expect(id).toBeTruthy();

    const retrieved = await adapter.get(id);
    expect(retrieved).toMatchObject({
      content: doc.content,
      metadata: doc.metadata,
    });
    expect(retrieved?.embedding).toHaveLength(3);
  });

  it("should search for similar documents", async () => {
    const docs: VectorDocument[] = [
      {
        id: "1",
        content: "First document",
        embedding: [1.0, 0.0, 0.0],
      },
      {
        id: "2",
        content: "Second document",
        embedding: [0.0, 1.0, 0.0],
      },
      {
        id: "3",
        content: "Third document",
        embedding: [0.0, 0.0, 1.0],
      },
    ];

    for (const doc of docs) {
      await adapter.insert(doc);
    }

    const results = await adapter.search([0.9, 0.1, 0.0], { k: 2 });
    expect(results).toHaveLength(2);
    expect(results[0]?.content).toBe("First document");
  });

  it("should handle batch operations", async () => {
    const docs: VectorDocument[] = Array.from({ length: 5 }, (_, i) => ({
      id: `batch-${i}`,
      content: `Batch document ${i}`,
      embedding: [i * 0.1, i * 0.2, i * 0.3],
    }));

    const ids = await adapter.insertBatch(docs);
    expect(ids).toHaveLength(5);

    const count = await adapter.count();
    expect(count).toBe(5);
  });

  it("should handle source metadata correctly", async () => {
    const sourceId = "source-123";
    const docs: VectorDocument[] = [
      {
        id: "chunk-1",
        content: "First chunk",
        embedding: [0.1, 0.2, 0.3],
        metadata: {
          sourceId,
          chunkIndex: 0,
          originalContent: "Full original content here",
          title: "Test Document",
        },
      },
      {
        id: "chunk-2",
        content: "Second chunk",
        embedding: [0.4, 0.5, 0.6],
        metadata: {
          sourceId,
          chunkIndex: 1,
        },
      },
    ];

    for (const doc of docs) {
      await adapter.insert(doc);
    }

    const firstChunk = await adapter.get("chunk-1");
    expect(firstChunk?.metadata?.sourceId).toBe(sourceId);
    expect(firstChunk?.metadata?.originalContent).toBe(
      "Full original content here",
    );

    const secondChunk = await adapter.get("chunk-2");
    expect(secondChunk?.metadata?.sourceId).toBe(sourceId);
    expect(secondChunk?.metadata?.originalContent).toBeUndefined();
  });

  it("should filter documents by metadata", async () => {
    const docs: VectorDocument[] = [
      {
        id: "1",
        content: "TypeScript file",
        embedding: [0.1, 0.2, 0.3],
        metadata: { type: "code", language: "typescript" },
      },
      {
        id: "2",
        content: "JavaScript file",
        embedding: [0.4, 0.5, 0.6],
        metadata: { type: "code", language: "javascript" },
      },
      {
        id: "3",
        content: "Documentation",
        embedding: [0.7, 0.8, 0.9],
        metadata: { type: "docs" },
      },
    ];

    for (const doc of docs) {
      await adapter.insert(doc);
    }

    const results = await adapter.search([0.5, 0.5, 0.5], {
      k: 10,
      filter: { type: "code" },
    });

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.metadata?.type === "code")).toBe(true);
  });

  it("should update documents", async () => {
    const doc: VectorDocument = {
      id: "update-test",
      content: "Original content",
      embedding: [0.1, 0.2, 0.3],
      metadata: { version: 1 },
    };

    const id = await adapter.insert(doc);

    await adapter.update(id, {
      content: "Updated content",
      metadata: { version: 2 },
    });

    const updated = await adapter.get(id);
    expect(updated?.content).toBe("Updated content");
    expect(updated?.metadata?.version).toBe(2);
  });

  it("should delete documents", async () => {
    const doc: VectorDocument = {
      id: "delete-test",
      content: "To be deleted",
      embedding: [0.1, 0.2, 0.3],
    };

    const id = await adapter.insert(doc);
    const exists = await adapter.get(id);
    expect(exists).toBeTruthy();

    await adapter.delete(id);
    const deleted = await adapter.get(id);
    expect(deleted).toBeNull();
  });

  it("should handle list operations with pagination", async () => {
    const docs = Array.from({ length: 10 }, (_, i) => ({
      id: `list-${i}`,
      content: `Document ${i}`,
      embedding: [i * 0.1, i * 0.1, i * 0.1],
    }));

    await adapter.insertBatch(docs);

    const page1 = await adapter.list({ limit: 5, offset: 0 });
    expect(page1).toHaveLength(5);

    const page2 = await adapter.list({ limit: 5, offset: 5 });
    expect(page2).toHaveLength(5);

    const all = await adapter.list({ limit: 20 });
    expect(all).toHaveLength(10);
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDuckDBAdapter } from "./duckdb-adapter.js";
import type { VectorDBAdapter, VectorDocument } from "./types.js";

describe("DuckDBAdapter", () => {
  let adapter: VectorDBAdapter;

  beforeEach(async () => {
    // Create in-memory DuckDB adapter for testing
    adapter = createDuckDBAdapter({
      provider: "duckdb",
      options: {
        path: ":memory:",
        dimension: 3,
        enableHNSW: false, // Disable HNSW for basic tests
      },
    });
    await adapter.initialize();
  });

  afterEach(async () => {
    if (adapter) {
      await adapter.close();
    }
  });

  describe("Basic Operations", () => {
    it("should insert and retrieve a document", async () => {
      const doc: VectorDocument = {
        id: "test-1",
        content: "Test content",
        embedding: [0.1, 0.2, 0.3],
        metadata: { category: "test" },
      };

      const id = await adapter.insert(doc);
      expect(id).toBe("test-1");

      const retrieved = await adapter.get("test-1");
      expect(retrieved).not.toBeNull();
      expect(retrieved?.content).toBe("Test content");
      // Check embedding values with tolerance for floating point precision
      expect(retrieved?.embedding).toHaveLength(3);
      expect(retrieved?.embedding?.[0]).toBeCloseTo(0.1, 5);
      expect(retrieved?.embedding?.[1]).toBeCloseTo(0.2, 5);
      expect(retrieved?.embedding?.[2]).toBeCloseTo(0.3, 5);
      expect(retrieved?.metadata?.category).toBe("test");
    });

    it("should handle document without ID", async () => {
      const doc: VectorDocument = {
        content: "No ID document",
        embedding: [0.4, 0.5, 0.6],
      };

      const id = await adapter.insert(doc);
      expect(id).toBeDefined();
      expect(typeof id).toBe("string");

      const retrieved = await adapter.get(id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.content).toBe("No ID document");
    });

    it("should update an existing document", async () => {
      const doc: VectorDocument = {
        id: "update-1",
        content: "Original content",
        embedding: [1, 2, 3],
      };

      await adapter.insert(doc);
      await adapter.update("update-1", {
        content: "Updated content",
        embedding: [4, 5, 6],
      });

      const updated = await adapter.get("update-1");
      expect(updated?.content).toBe("Updated content");
      // Check embedding values with tolerance for floating point precision
      expect(updated?.embedding).toHaveLength(3);
      expect(updated?.embedding?.[0]).toBeCloseTo(4, 5);
      expect(updated?.embedding?.[1]).toBeCloseTo(5, 5);
      expect(updated?.embedding?.[2]).toBeCloseTo(6, 5);
    });

    it("should delete a document", async () => {
      const doc: VectorDocument = {
        id: "delete-1",
        content: "To be deleted",
        embedding: [7, 8, 9],
      };

      await adapter.insert(doc);
      const beforeDelete = await adapter.get("delete-1");
      expect(beforeDelete).not.toBeNull();

      await adapter.delete("delete-1");
      const afterDelete = await adapter.get("delete-1");
      expect(afterDelete).toBeNull();
    });
  });

  describe("Batch Operations", () => {
    it("should insert multiple documents in batch", async () => {
      const docs: VectorDocument[] = [
        { id: "batch-1", content: "Doc 1", embedding: [0.1, 0.1, 0.1] },
        { id: "batch-2", content: "Doc 2", embedding: [0.2, 0.2, 0.2] },
        { id: "batch-3", content: "Doc 3", embedding: [0.3, 0.3, 0.3] },
      ];

      const ids = await adapter.insertBatch(docs);
      expect(ids).toEqual(["batch-1", "batch-2", "batch-3"]);

      const count = await adapter.count();
      expect(count).toBe(3);
    });

    it("should delete multiple documents in batch", async () => {
      const docs: VectorDocument[] = [
        { id: "del-1", content: "Doc 1", embedding: [1, 1, 1] },
        { id: "del-2", content: "Doc 2", embedding: [2, 2, 2] },
        { id: "del-3", content: "Doc 3", embedding: [3, 3, 3] },
      ];

      await adapter.insertBatch(docs);
      await adapter.deleteBatch(["del-1", "del-3"]);

      const remaining = await adapter.count();
      expect(remaining).toBe(1);

      const doc2 = await adapter.get("del-2");
      expect(doc2).not.toBeNull();
    });
  });

  describe("Vector Search", () => {
    beforeEach(async () => {
      // Insert test documents for search tests
      const docs: VectorDocument[] = [
        { id: "search-1", content: "First", embedding: [1, 0, 0] },
        { id: "search-2", content: "Second", embedding: [0, 1, 0] },
        { id: "search-3", content: "Third", embedding: [0, 0, 1] },
        { id: "search-4", content: "Fourth", embedding: [0.5, 0.5, 0] },
      ];
      await adapter.insertBatch(docs);
    });

    it("should find similar vectors", async () => {
      const query = [1, 0, 0]; // Should match "First" closely
      const results = await adapter.search(query, { k: 2 });

      expect(results).toHaveLength(2);
      expect(results[0]?.id).toBe("search-1");
      expect(results[0]?.score).toBeGreaterThan(0.5);
    });

    it("should respect k parameter", async () => {
      const query = [0.5, 0.5, 0.5];
      const results = await adapter.search(query, { k: 3 });

      expect(results).toHaveLength(3);
    });

    it("should return all results when k > document count", async () => {
      const query = [0, 0, 0];
      const results = await adapter.search(query, { k: 10 });

      expect(results).toHaveLength(4); // Only 4 documents exist
    });
  });

  describe("List Operations", () => {
    beforeEach(async () => {
      // Insert test documents
      const docs: VectorDocument[] = [];
      for (let i = 1; i <= 5; i++) {
        docs.push({
          id: `list-${i}`,
          content: `Document ${i}`,
          embedding: [i, i, i],
        });
      }
      await adapter.insertBatch(docs);
    });

    it("should list documents with default options", async () => {
      const docs = await adapter.list();
      expect(docs).toHaveLength(5);
    });

    it("should respect limit option", async () => {
      const docs = await adapter.list({ limit: 3 });
      expect(docs).toHaveLength(3);
    });

    it("should respect offset option", async () => {
      const docs = await adapter.list({ limit: 2, offset: 2 });
      expect(docs).toHaveLength(2);
    });
  });

  describe("Adapter Info", () => {
    it("should return correct adapter information", () => {
      const info = adapter.getInfo();
      expect(info.provider).toBe("duckdb");
      expect(info.version).toBe("1.0.0");
      expect(info.capabilities).toContain("vector-search");
      expect(info.capabilities).toContain("hnsw-index");
      expect(info.capabilities).toContain("batch-operations");
    });
  });
});

describe("DuckDBAdapter with HNSW", () => {
  let adapter: VectorDBAdapter;

  beforeEach(async () => {
    // Create DuckDB adapter with HNSW enabled
    adapter = createDuckDBAdapter({
      provider: "duckdb",
      options: {
        path: ":memory:",
        dimension: 3,
        enableHNSW: true,
        hnswMetric: "cosine",
        hnswPersistence: false,
      },
    });
    await adapter.initialize();
  });

  afterEach(async () => {
    if (adapter) {
      await adapter.close();
    }
  });

  it("should perform vector search with HNSW index", async () => {
    // Insert documents
    const docs: VectorDocument[] = [
      { id: "hnsw-1", content: "Doc 1", embedding: [1, 0, 0] },
      { id: "hnsw-2", content: "Doc 2", embedding: [0, 1, 0] },
      { id: "hnsw-3", content: "Doc 3", embedding: [0, 0, 1] },
    ];
    await adapter.insertBatch(docs);

    // Search with cosine similarity
    const query = [Math.SQRT1_2, Math.SQRT1_2, 0]; // 45 degrees between first two axes
    const results = await adapter.search(query, { k: 2 });

    expect(results).toHaveLength(2);
    // Results should be ordered by similarity (or equal if same distance)
    expect(results[0]?.score).toBeGreaterThanOrEqual(results[1]?.score ?? 0);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryAdapter } from "./memory-adapter.js";
import type { VectorDBAdapter, VectorDocument } from "./types.js";

describe("createMemoryAdapter", () => {
  let adapter: VectorDBAdapter;

  beforeEach(async () => {
    adapter = createMemoryAdapter({
      provider: "memory",
      options: { dimension: 3 },
    });
    await adapter.initialize();
  });

  describe("insert", () => {
    it("should insert a document and return its ID", async () => {
      const doc: VectorDocument = {
        content: "test content",
        embedding: [0.1, 0.2, 0.3],
        metadata: { type: "test" },
      };

      const id = await adapter.insert(doc);
      expect(id).toBeDefined();
      expect(typeof id).toBe("string");

      const retrieved = await adapter.get(id);
      expect(retrieved).toMatchObject({
        id,
        content: "test content",
        embedding: [0.1, 0.2, 0.3],
        metadata: { type: "test" },
      });
    });

    it("should use provided ID if specified", async () => {
      const doc: VectorDocument = {
        id: "custom-id",
        content: "test",
        embedding: [0.1, 0.2, 0.3],
      };

      const id = await adapter.insert(doc);
      expect(id).toBe("custom-id");
    });

    it("should validate embedding dimension", async () => {
      const doc: VectorDocument = {
        content: "test",
        embedding: [0.1, 0.2], // Wrong dimension
      };

      await expect(adapter.insert(doc)).rejects.toThrow("dimension");
    });
  });

  describe("search", () => {
    beforeEach(async () => {
      await adapter.insert({
        id: "doc1",
        content: "first document",
        embedding: [1, 0, 0],
        metadata: { type: "a" },
      });
      await adapter.insert({
        id: "doc2",
        content: "second document",
        embedding: [0, 1, 0],
        metadata: { type: "b" },
      });
      await adapter.insert({
        id: "doc3",
        content: "third document",
        embedding: [0, 0, 1],
        metadata: { type: "a" },
      });
    });

    it("should find similar documents", async () => {
      const results = await adapter.search([1, 0, 0], { k: 2 });

      expect(results).toHaveLength(2);
      expect(results[0]?.id).toBe("doc1");
      expect(results[0]?.score).toBeCloseTo(1.0, 5);
    });

    it("should apply metadata filter", async () => {
      const results = await adapter.search([1, 0, 0], {
        k: 10,
        filter: { type: "a" },
      });

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.metadata?.type === "a")).toBe(true);
    });

    it("should limit results to k", async () => {
      const results = await adapter.search([0.5, 0.5, 0], { k: 1 });
      expect(results).toHaveLength(1);
    });
  });

  describe("update", () => {
    it("should update an existing document", async () => {
      const id = await adapter.insert({
        content: "original",
        embedding: [1, 0, 0],
      });

      await adapter.update(id, {
        content: "updated",
        metadata: { updated: true },
      });

      const doc = await adapter.get(id);
      expect(doc?.content).toBe("updated");
      expect(doc?.metadata).toEqual({ updated: true });
      expect(doc?.embedding).toEqual([1, 0, 0]); // Unchanged
    });

    it("should throw error when updating non-existent document", async () => {
      await expect(
        adapter.update("non-existent", { content: "test" }),
      ).rejects.toThrow("not found");
    });
  });

  describe("delete", () => {
    it("should delete an existing document", async () => {
      const id = await adapter.insert({
        content: "to delete",
        embedding: [1, 0, 0],
      });

      await adapter.delete(id);
      const doc = await adapter.get(id);
      expect(doc).toBeNull();
    });

    it("should throw error when deleting non-existent document", async () => {
      await expect(adapter.delete("non-existent")).rejects.toThrow("not found");
    });
  });

  describe("batch operations", () => {
    it("should insert multiple documents", async () => {
      const docs: VectorDocument[] = [
        { content: "doc1", embedding: [1, 0, 0] },
        { content: "doc2", embedding: [0, 1, 0] },
      ];

      const ids = await adapter.insertBatch(docs);
      expect(ids).toHaveLength(2);

      const count = await adapter.count();
      expect(count).toBe(2);
    });

    it("should delete multiple documents", async () => {
      const ids = await adapter.insertBatch([
        { content: "doc1", embedding: [1, 0, 0] },
        { content: "doc2", embedding: [0, 1, 0] },
      ]);

      await adapter.deleteBatch(ids);
      const count = await adapter.count();
      expect(count).toBe(0);
    });
  });

  describe("count and list", () => {
    beforeEach(async () => {
      await adapter.insertBatch([
        { content: "doc1", embedding: [1, 0, 0], metadata: { type: "a" } },
        { content: "doc2", embedding: [0, 1, 0], metadata: { type: "b" } },
        { content: "doc3", embedding: [0, 0, 1], metadata: { type: "a" } },
      ]);
    });

    it("should count all documents", async () => {
      const count = await adapter.count();
      expect(count).toBe(3);
    });

    it("should count with filter", async () => {
      const count = await adapter.count({ type: "a" });
      expect(count).toBe(2);
    });

    it("should list documents with pagination", async () => {
      const page1 = await adapter.list({ limit: 2, offset: 0 });
      expect(page1).toHaveLength(2);

      const page2 = await adapter.list({ limit: 2, offset: 2 });
      expect(page2).toHaveLength(1);
    });

    it("should list with filter", async () => {
      const docs = await adapter.list({ filter: { type: "b" } });
      expect(docs).toHaveLength(1);
      expect(docs[0]?.metadata?.type).toBe("b");
    });
  });

  describe("getInfo", () => {
    it("should return adapter information", () => {
      const info = adapter.getInfo();
      expect(info.provider).toBe("memory");
      expect(info.version).toBeDefined();
      expect(info.capabilities).toContain("vector-search");
    });
  });

  describe("close", () => {
    it("should clear all documents on close", async () => {
      await adapter.insert({ content: "test", embedding: [1, 0, 0] });
      expect(await adapter.count()).toBe(1);

      await adapter.close();
      expect(await adapter.count()).toBe(0);
    });
  });
});

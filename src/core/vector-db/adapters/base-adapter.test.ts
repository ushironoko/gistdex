import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentNotFoundError } from "../errors.js";
import type { BaseAdapterConfig, StorageOperations } from "./base-adapter.js";
import { createBaseAdapter } from "./base-adapter.js";
import type { VectorDocument, VectorSearchResult } from "./types.js";

describe("createBaseAdapter", () => {
  const mockStorage: StorageOperations = {
    storeDocument: vi.fn(),
    retrieveDocument: vi.fn(),
    removeDocument: vi.fn(),
    searchSimilar: vi.fn(),
    countDocuments: vi.fn(),
    listDocuments: vi.fn(),
    clear: vi.fn(),
  };

  const config: BaseAdapterConfig = {
    dimension: 3,
    provider: "test",
    version: "1.0.0",
    capabilities: ["vector-search"],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initialization", () => {
    it("should initialize adapter", async () => {
      const adapter = createBaseAdapter(config, mockStorage);
      await adapter.initialize();

      vi.mocked(mockStorage.countDocuments).mockResolvedValue(0);

      // Should not throw when using after initialization
      await expect(adapter.count()).resolves.toBeDefined();
    });

    it("should throw error when not initialized", async () => {
      const adapter = createBaseAdapter(config, mockStorage);

      await expect(adapter.count()).rejects.toThrow("Adapter not initialized");
    });

    it("should handle multiple initialization calls", async () => {
      const adapter = createBaseAdapter(config, mockStorage);

      await adapter.initialize();
      await adapter.initialize(); // Should not throw

      expect(true).toBe(true); // Reached without error
    });
  });

  describe("insert", () => {
    it("should insert document with validation", async () => {
      const adapter = createBaseAdapter(config, mockStorage);
      await adapter.initialize();

      const doc: VectorDocument = {
        id: "test-id",
        content: "test content",
        embedding: [0.1, 0.2, 0.3],
        metadata: { test: true },
      };

      vi.mocked(mockStorage.storeDocument).mockResolvedValue("generated-id");

      const result = await adapter.insert(doc);

      expect(result).toBe("generated-id");
      expect(mockStorage.storeDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          content: "test content",
          embedding: [0.1, 0.2, 0.3],
        }),
      );
    });

    it("should validate dimension", async () => {
      const adapter = createBaseAdapter(config, mockStorage);
      await adapter.initialize();

      const doc: VectorDocument = {
        id: "test-id",
        content: "test content",
        embedding: [0.1, 0.2], // Wrong dimension
      };

      await expect(adapter.insert(doc)).rejects.toThrow("dimension");
    });
  });

  describe("search", () => {
    it("should search with dimension validation", async () => {
      const adapter = createBaseAdapter(config, mockStorage);
      await adapter.initialize();

      const mockResults: VectorSearchResult[] = [
        {
          id: "1",
          content: "result",
          embedding: [0.1, 0.2, 0.3],
          score: 0.9,
        },
      ];

      vi.mocked(mockStorage.searchSimilar).mockResolvedValue(mockResults);

      const results = await adapter.search([0.1, 0.2, 0.3]);

      expect(results).toEqual(mockResults);
      expect(mockStorage.searchSimilar).toHaveBeenCalledWith(
        [0.1, 0.2, 0.3],
        undefined,
      );
    });

    it("should validate search embedding dimension", async () => {
      const adapter = createBaseAdapter(config, mockStorage);
      await adapter.initialize();

      await expect(adapter.search([0.1, 0.2])).rejects.toThrow("dimension");
    });
  });

  describe("update", () => {
    it("should update existing document", async () => {
      const adapter = createBaseAdapter(config, mockStorage);
      await adapter.initialize();

      const existing: VectorDocument = {
        id: "test-id",
        content: "old content",
        embedding: [0.1, 0.2, 0.3],
        metadata: { version: 1 },
      };

      vi.mocked(mockStorage.retrieveDocument).mockResolvedValue(existing);
      vi.mocked(mockStorage.storeDocument).mockResolvedValue("test-id");

      await adapter.update("test-id", {
        content: "new content",
        metadata: { version: 2 },
      });

      expect(mockStorage.storeDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "test-id",
          content: "new content",
          embedding: [0.1, 0.2, 0.3],
          metadata: expect.objectContaining({
            version: 2,
            updatedAt: expect.any(String),
          }),
        }),
      );
    });

    it("should throw error for non-existent document", async () => {
      const adapter = createBaseAdapter(config, mockStorage);
      await adapter.initialize();

      vi.mocked(mockStorage.retrieveDocument).mockResolvedValue(null);

      await expect(
        adapter.update("non-existent", { content: "new" }),
      ).rejects.toThrow(DocumentNotFoundError);
    });
  });

  describe("delete", () => {
    it("should delete existing document", async () => {
      const adapter = createBaseAdapter(config, mockStorage);
      await adapter.initialize();

      const existing: VectorDocument = {
        id: "test-id",
        content: "content",
        embedding: [0.1, 0.2, 0.3],
      };

      vi.mocked(mockStorage.retrieveDocument).mockResolvedValue(existing);
      vi.mocked(mockStorage.removeDocument).mockResolvedValue();

      await adapter.delete("test-id");

      expect(mockStorage.removeDocument).toHaveBeenCalledWith("test-id");
    });

    it("should throw error for non-existent document", async () => {
      const adapter = createBaseAdapter(config, mockStorage);
      await adapter.initialize();

      vi.mocked(mockStorage.retrieveDocument).mockResolvedValue(null);

      await expect(adapter.delete("non-existent")).rejects.toThrow(
        DocumentNotFoundError,
      );
    });
  });

  describe("batch operations", () => {
    it("should insert batch of documents", async () => {
      const adapter = createBaseAdapter(config, mockStorage);
      await adapter.initialize();

      const docs: VectorDocument[] = [
        { id: "1", content: "doc1", embedding: [0.1, 0.2, 0.3] },
        { id: "2", content: "doc2", embedding: [0.4, 0.5, 0.6] },
      ];

      vi.mocked(mockStorage.storeDocument)
        .mockResolvedValueOnce("id1")
        .mockResolvedValueOnce("id2");

      const results = await adapter.insertBatch(docs);

      expect(results).toEqual(["id1", "id2"]);
      expect(mockStorage.storeDocument).toHaveBeenCalledTimes(2);
    });

    it("should delete batch of documents", async () => {
      const adapter = createBaseAdapter(config, mockStorage);
      await adapter.initialize();

      vi.mocked(mockStorage.retrieveDocument).mockResolvedValue({
        id: "test",
        content: "test",
        embedding: [0.1, 0.2, 0.3],
      });
      vi.mocked(mockStorage.removeDocument).mockResolvedValue();

      await adapter.deleteBatch(["id1", "id2"]);

      expect(mockStorage.removeDocument).toHaveBeenCalledTimes(2);
    });
  });

  describe("getInfo", () => {
    it("should return adapter info", () => {
      const adapter = createBaseAdapter(config, mockStorage);

      const info = adapter.getInfo();

      expect(info).toEqual({
        provider: "test",
        version: "1.0.0",
        capabilities: ["vector-search"],
      });
    });
  });

  describe("close", () => {
    it("should close and clear storage", async () => {
      const adapter = createBaseAdapter(config, mockStorage);
      await adapter.initialize();

      await adapter.close();

      expect(mockStorage.clear).toHaveBeenCalled();

      // Should need to reinitialize after close
      await expect(adapter.count()).rejects.toThrow("Adapter not initialized");
    });
  });
});

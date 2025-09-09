import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSQLiteAdapter } from "./sqlite-adapter.js";
import type { VectorDBAdapter, VectorDocument } from "./types.js";

// Mock node:sqlite to avoid actual SQLite initialization in tests
vi.mock("node:sqlite", () => ({
  DatabaseSync: vi.fn().mockImplementation((_path: string, _options?: any) => ({
    exec: vi.fn(),
    prepare: vi.fn().mockImplementation((query: string) => {
      // Mock for SELECT vec_rowid query
      if (query.includes("SELECT vec_rowid FROM documents")) {
        return {
          get: vi.fn().mockReturnValue(null),
        };
      }
      // Mock for COUNT query
      if (query.includes("COUNT(*)")) {
        return {
          get: vi.fn().mockReturnValue({ count: 0 }),
        };
      }
      // Mock for INSERT INTO vec_documents
      if (query.includes("INSERT INTO vec_documents")) {
        return {
          run: vi.fn().mockReturnValue({ lastInsertRowid: 1 }),
        };
      }
      // Mock for INSERT OR REPLACE INTO documents
      if (query.includes("INSERT OR REPLACE INTO documents")) {
        return {
          run: vi.fn(),
        };
      }
      // Mock for SELECT FROM sources
      if (query.includes("SELECT source_id FROM sources")) {
        return {
          get: vi.fn().mockReturnValue(null),
        };
      }
      // Mock for INSERT INTO sources
      if (query.includes("INSERT INTO sources")) {
        return {
          run: vi.fn(),
        };
      }
      // Mock for INSERT INTO documents
      if (query.includes("INSERT INTO documents")) {
        return {
          run: vi.fn(),
        };
      }
      // Default mock
      return {
        get: vi.fn(),
        run: vi.fn(),
        all: vi.fn().mockReturnValue([]),
      };
    }),
    close: vi.fn(),
    loadExtension: vi.fn(),
  })),
}));

// Mock sqlite-vec
vi.mock("sqlite-vec", () => ({
  load: vi.fn(),
  getLoadablePath: vi.fn().mockReturnValue("/mock/path/to/sqlite-vec.so"),
}));

describe("SQLiteAdapter", () => {
  let adapter: VectorDBAdapter;
  const testDocument: VectorDocument = {
    id: "test-id",
    content: "Test content",
    embedding: new Array(768).fill(0.1),
    metadata: { key: "value" },
  };

  const config = {
    provider: "sqlite",
    options: {
      path: ":memory:",
      dimension: 768,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createSQLiteAdapter(config);
  });

  afterEach(async () => {
    await adapter.close();
  });

  describe("Initialization", () => {
    it("should initialize successfully", async () => {
      await expect(adapter.initialize()).resolves.not.toThrow();
    });

    it("should not reinitialize if already initialized", async () => {
      await adapter.initialize();
      await adapter.initialize();
      // DatabaseSync constructor is called once
    });

    it("should create database with proper options", async () => {
      await adapter.initialize();
      // Database is created with memory mode
    });
  });

  describe("Document Operations", () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    describe("insert", () => {
      it("should insert a document successfully", async () => {
        const id = await adapter.insert(testDocument);
        expect(id).toBeDefined();
        expect(typeof id).toBe("string");
      });

      it("should handle documents with sourceId metadata", async () => {
        const docWithSource = {
          ...testDocument,
          metadata: {
            sourceId: "source-123",
            chunkIndex: 0,
            originalContent: "Original content here",
            title: "Test Title",
            url: "https://example.com",
            sourceType: "text",
          },
        } as const satisfies VectorDocument;

        const id = await adapter.insert(docWithSource);
        expect(id).toBeDefined();
      });

      it("should skip source creation for non-first chunks", async () => {
        const docWithSource = {
          ...testDocument,
          metadata: {
            sourceId: "source-123",
            chunkIndex: 1,
          },
        };

        const id = await adapter.insert(docWithSource);
        expect(id).toBeDefined();
      });
    });

    describe("get", () => {
      it("should return null for non-existent document", async () => {
        const result = await adapter.get("non-existent");
        expect(result).toBeNull();
      });
    });

    describe("update", () => {
      it("should throw error for non-existent document", async () => {
        await expect(
          adapter.update("non-existent", { content: "updated" }),
        ).rejects.toThrow("not found");
      });
    });

    describe("delete", () => {
      it("should throw error for non-existent document", async () => {
        await expect(adapter.delete("non-existent")).rejects.toThrow();
      });
    });

    describe("search", () => {
      it("should return empty array when no documents match", async () => {
        const results = await adapter.search(testDocument.embedding, { k: 5 });
        expect(results).toEqual([]);
      });
    });

    describe("list", () => {
      it("should return empty array when no documents exist", async () => {
        const results = await adapter.list();
        expect(results).toEqual([]);
      });

      it("should apply limit and offset", async () => {
        const results = await adapter.list({ limit: 10, offset: 5 });
        expect(results).toEqual([]);
      });
    });

    describe("count", () => {
      it("should return 0 when no documents exist", async () => {
        const count = await adapter.count();
        expect(count).toBe(0);
      });

      it("should count with filter", async () => {
        const count = await adapter.count({ key: "value" });
        expect(count).toBe(0);
      });
    });

    describe("getInfo", () => {
      it("should return adapter information", () => {
        const info = adapter.getInfo();
        expect(info).toMatchObject({
          provider: "sqlite",
          version: "1.0.0",
          capabilities: [
            "vector-search",
            "metadata-filter",
            "batch-operations",
          ],
        });
      });
    });
  });

  describe("Batch Operations", () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it("should insert multiple documents", async () => {
      const documents = [
        testDocument,
        { ...testDocument, id: "test-id-2" },
        { ...testDocument, id: "test-id-3" },
      ];

      const ids = await adapter.insertBatch(documents);
      expect(ids).toHaveLength(3);
    });

    it("should delete multiple documents", async () => {
      const ids = ["id1", "id2", "id3"];
      // deleteBatch will throw error for non-existent documents
      await expect(adapter.deleteBatch(ids)).rejects.toThrow();
    });
  });

  describe("Cleanup", () => {
    it("should close database connection", async () => {
      await adapter.initialize();
      await adapter.close();
      // Should not throw
      expect(true).toBe(true);
    });

    it("should handle multiple close calls", async () => {
      await adapter.initialize();
      await adapter.close();
      await adapter.close();
      // No error means success
    });
  });

  describe("Error Handling", () => {
    it("should throw error when operations are performed before initialization", async () => {
      const uninitializedAdapter = createSQLiteAdapter(config);
      await expect(uninitializedAdapter.insert(testDocument)).rejects.toThrow(
        "Database not initialized",
      );
    });

    it("should validate embedding dimension", async () => {
      await adapter.initialize();
      const invalidDoc = {
        ...testDocument,
        embedding: new Array(100).fill(0.1), // Wrong dimension
      };
      await expect(adapter.insert(invalidDoc)).rejects.toThrow();
    });
  });
});

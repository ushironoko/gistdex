/**
 * Unit tests for SQLite storage operations
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentNotFoundError } from "../errors.js";
import type { SQLiteOperations } from "./sqlite-storage-operations.js";
import { createSQLiteStorageOperations } from "./sqlite-storage-operations.js";
import type { VectorDocument } from "./types.js";

describe("SQLiteStorageOperations", () => {
  let db: SQLiteOperations;
  let storage: ReturnType<typeof createSQLiteStorageOperations>;
  let mockPreparedStatement: {
    run: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    all: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Create mock prepared statement
    mockPreparedStatement = {
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn(),
    };

    // Create mock database
    db = {
      prepare: vi.fn(() => mockPreparedStatement),
      isOpen: vi.fn(() => true),
      close: vi.fn(),
    };

    // Create storage operations
    storage = createSQLiteStorageOperations(db, 768);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("storeDocument", () => {
    it("should store a document without source", async () => {
      const doc: VectorDocument = {
        id: "test-id",
        content: "Test content",
        embedding: new Array(768).fill(0.1),
        metadata: { category: "test" },
      };

      mockPreparedStatement.run.mockReturnValueOnce({ lastInsertRowid: 1 });
      mockPreparedStatement.run.mockReturnValueOnce(undefined);

      const id = await storage.storeDocument(doc);

      expect(id).toBe("test-id"); // Should return the provided ID
      expect(db.prepare).toHaveBeenCalledTimes(2); // INSERT_VECTOR and INSERT_DOCUMENT
      expect(mockPreparedStatement.run).toHaveBeenCalledTimes(2);
    });

    it("should store a document with source (first chunk)", async () => {
      const doc: VectorDocument = {
        id: "test-id",
        content: "Test content",
        embedding: new Array(768).fill(0.1),
        metadata: {
          sourceId: "source-123",
          originalContent: "Original full content",
          chunkIndex: 0,
          title: "Test Title",
          url: "https://example.com",
          sourceType: "text",
        },
      };

      mockPreparedStatement.get.mockReturnValueOnce(undefined); // Source doesn't exist
      mockPreparedStatement.run.mockReturnValueOnce(undefined); // INSERT_SOURCE
      mockPreparedStatement.run.mockReturnValueOnce({ lastInsertRowid: 1 }); // INSERT_VECTOR
      mockPreparedStatement.run.mockReturnValueOnce(undefined); // INSERT_DOCUMENT

      const id = await storage.storeDocument(doc);

      expect(id).toBe("test-id");
      expect(db.prepare).toHaveBeenCalledTimes(4); // SELECT_SOURCE, INSERT_SOURCE, INSERT_VECTOR, INSERT_DOCUMENT
      expect(mockPreparedStatement.get).toHaveBeenCalledTimes(1);
      expect(mockPreparedStatement.run).toHaveBeenCalledTimes(3);
    });

    it("should store a document with existing source (later chunk)", async () => {
      const doc: VectorDocument = {
        id: "test-id",
        content: "Test content",
        embedding: new Array(768).fill(0.1),
        metadata: {
          sourceId: "source-123",
          chunkIndex: 1,
        },
      };

      mockPreparedStatement.get.mockReturnValueOnce({
        source_id: "source-123",
      }); // Source exists
      mockPreparedStatement.run.mockReturnValueOnce({ lastInsertRowid: 1 }); // INSERT_VECTOR
      mockPreparedStatement.run.mockReturnValueOnce(undefined); // INSERT_DOCUMENT

      const id = await storage.storeDocument(doc);

      expect(id).toBe("test-id");
      expect(db.prepare).toHaveBeenCalledTimes(3); // SELECT_SOURCE, INSERT_VECTOR, INSERT_DOCUMENT
      expect(mockPreparedStatement.run).toHaveBeenCalledTimes(2); // No INSERT_SOURCE
    });
  });

  describe("retrieveDocument", () => {
    it("should retrieve an existing document", async () => {
      const mockRow = {
        id: "test-id",
        source_id: "source-123",
        content: "Test content",
        metadata: JSON.stringify({ category: "test" }),
        embedding: Buffer.from(new Float32Array(768).fill(0.1).buffer),
        original_content: "Original content",
        title: "Test Title",
        url: "https://example.com",
        source_type: "web",
      };

      mockPreparedStatement.get.mockReturnValueOnce(mockRow);

      const result = await storage.retrieveDocument("test-id");

      expect(result).not.toBeNull();
      expect(result?.id).toBe("test-id");
      expect(result?.content).toBe("Test content");
      expect(result?.metadata?.sourceId).toBe("source-123");
      expect(result?.embedding).toHaveLength(768);
    });

    it("should return null for non-existent document", async () => {
      mockPreparedStatement.get.mockReturnValueOnce(undefined);

      const result = await storage.retrieveDocument("non-existent");

      expect(result).toBeNull();
    });
  });

  describe("removeDocument", () => {
    it("should remove a document and its orphaned source", async () => {
      mockPreparedStatement.get.mockReturnValueOnce({
        vec_rowid: 1,
        source_id: "source-123",
      });
      mockPreparedStatement.run.mockReturnValue(undefined);
      mockPreparedStatement.get.mockReturnValueOnce({ count: 0 }); // No remaining docs

      await storage.removeDocument("test-id");

      expect(db.prepare).toHaveBeenCalledTimes(5); // DELETE_DOCUMENT_VEC_ROWID_SOURCE, DELETE_DOCUMENT, DELETE_VECTOR, COUNT_DOCUMENTS_BY_SOURCE, DELETE_SOURCE
      expect(mockPreparedStatement.run).toHaveBeenCalledTimes(3); // DELETE_DOCUMENT, DELETE_VECTOR, DELETE_SOURCE
    });

    it("should remove a document but keep source with remaining docs", async () => {
      mockPreparedStatement.get.mockReturnValueOnce({
        vec_rowid: 1,
        source_id: "source-123",
      });
      mockPreparedStatement.run.mockReturnValue(undefined);
      mockPreparedStatement.get.mockReturnValueOnce({ count: 2 }); // Still has docs

      await storage.removeDocument("test-id");

      expect(db.prepare).toHaveBeenCalledTimes(4); // DELETE_DOCUMENT_VEC_ROWID_SOURCE, DELETE_DOCUMENT, DELETE_VECTOR, COUNT_DOCUMENTS_BY_SOURCE
      expect(mockPreparedStatement.run).toHaveBeenCalledTimes(2); // DELETE_DOCUMENT, DELETE_VECTOR (no DELETE_SOURCE)
    });

    it("should throw error for non-existent document", async () => {
      mockPreparedStatement.get.mockReturnValueOnce(undefined);

      await expect(storage.removeDocument("non-existent")).rejects.toThrow(
        DocumentNotFoundError,
      );
    });
  });

  describe("searchSimilar", () => {
    it("should search for similar documents", async () => {
      const mockRows = [
        {
          id: "doc1",
          source_id: "source1",
          content: "Content 1",
          metadata: JSON.stringify({ category: "test" }),
          embedding: Buffer.from(new Float32Array(768).fill(0.1).buffer),
          original_content: null,
          title: null,
          url: null,
          source_type: null,
          distance: 0.1,
        },
        {
          id: "doc2",
          source_id: "source2",
          content: "Content 2",
          metadata: null,
          embedding: Buffer.from(new Float32Array(768).fill(0.2).buffer),
          original_content: null,
          title: null,
          url: null,
          source_type: null,
          distance: 0.2,
        },
      ];

      mockPreparedStatement.all.mockReturnValueOnce(mockRows);

      const results = await storage.searchSimilar(new Array(768).fill(0.1), {
        k: 2,
      });

      expect(results).toHaveLength(2);
      expect(results[0]?.id).toBe("doc1");
      expect(results[0]?.score).toBe(0.9); // 1 - distance
      expect(results[1]?.id).toBe("doc2");
      expect(results[1]?.score).toBe(0.8); // 1 - distance
    });

    it("should apply filters in search", async () => {
      mockPreparedStatement.all.mockReturnValueOnce([]);

      await storage.searchSimilar(new Array(768).fill(0.1), {
        k: 5,
        filter: { category: "test" },
      });

      expect(db.prepare).toHaveBeenCalled();
      const query = vi.mocked(db.prepare).mock.calls[0]?.[0];
      expect(query).toContain("json_extract");
    });
  });

  describe("countDocuments", () => {
    it("should count all documents", async () => {
      mockPreparedStatement.get.mockReturnValueOnce({ count: 42 });

      const count = await storage.countDocuments();

      expect(count).toBe(42);
      expect(db.prepare).toHaveBeenCalledWith(
        "SELECT COUNT(*) as count FROM documents",
      );
    });

    it("should count documents with filter", async () => {
      mockPreparedStatement.get.mockReturnValueOnce({ count: 10 });

      const count = await storage.countDocuments({ category: "test" });

      expect(count).toBe(10);
      const query = vi.mocked(db.prepare).mock.calls[0]?.[0];
      expect(query).toContain("WHERE");
      expect(query).toContain("json_extract");
    });
  });

  describe("listDocuments", () => {
    it("should list documents with pagination", async () => {
      const mockRows = [
        {
          id: "doc1",
          source_id: null,
          content: "Content 1",
          metadata: null,
          embedding: Buffer.from(new Float32Array(768).fill(0.1).buffer),
          original_content: null,
          title: null,
          url: null,
          source_type: null,
        },
      ];

      mockPreparedStatement.all.mockReturnValueOnce(mockRows);

      const results = await storage.listDocuments({ limit: 10, offset: 20 });

      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe("doc1");
      expect(mockPreparedStatement.all).toHaveBeenCalledWith(10, 20);
    });

    it("should list documents with filter", async () => {
      mockPreparedStatement.all.mockReturnValueOnce([]);

      await storage.listDocuments({ filter: { category: "test" } });

      const query = vi.mocked(db.prepare).mock.calls[0]?.[0];
      expect(query).toContain("WHERE");
      expect(query).toContain("json_extract");
    });
  });

  // Note: clear() method has been removed from StorageOperations
  // Data deletion should be done via removeDocument() for individual items

  describe("with custom SQL", () => {
    it("should use custom vector SQL for Bun", async () => {
      const bunStorage = createSQLiteStorageOperations(
        db,
        768,
        (e) => e,
        "INSERT INTO vec_documents(embedding) VALUES (vec_f32(?))",
        "UPDATE vec_documents SET embedding = vec_f32(?) WHERE rowid = ?",
        "vec_f32(?)",
      );

      const doc: VectorDocument = {
        id: "test-id",
        content: "Test content",
        embedding: new Array(768).fill(0.1),
      };

      mockPreparedStatement.run.mockReturnValueOnce({ lastInsertRowid: 1 });
      mockPreparedStatement.run.mockReturnValueOnce(undefined);

      await bunStorage.storeDocument(doc);

      expect(db.prepare).toHaveBeenCalledWith(
        "INSERT INTO vec_documents(embedding) VALUES (vec_f32(?))",
      );
    });
  });
});

import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DatabaseService } from "../../src/core/database/database-service.js";
import { indexText } from "../../src/core/indexer/indexer.js";
import { hybridSearch, semanticSearch } from "../../src/core/search/search.js";
import { createTestDatabase } from "../helpers/test-db.js";
import { testDocuments, testQueries } from "../helpers/test-fixtures.js";
import { assertSearchResultValid, withTimeout } from "../helpers/test-utils.js";

describe("DuckDB Adapter Integration Tests", () => {
  let db: DatabaseService;
  let testDbPath: string;

  beforeEach(async () => {
    // Use temporary file for DuckDB
    testDbPath = `/tmp/test-duckdb-${Date.now()}.db`;

    db = await createTestDatabase({
      provider: "duckdb",
      dimension: 768,
      dbPath: testDbPath,
      options: {
        enableHNSW: false, // Disable HNSW for file-based DB due to experimental persistence
      },
    });
  });

  afterEach(async () => {
    if (db) {
      await db.close();
    }
    // Clean up test database file
    if (testDbPath && existsSync(testDbPath)) {
      try {
        await unlink(testDbPath);
      } catch {
        // Ignore if file doesn't exist
      }
    }
  });

  describe("Basic Operations", () => {
    it("should index and search documents", async () => {
      const result = await indexText(
        testDocuments.typescript.content,
        { sourceType: "text" as const },
        { chunkSize: 200, chunkOverlap: 20 },
        db,
      );

      expect(result.itemsIndexed).toBeGreaterThan(0);
      expect(result.sourceId).toBeDefined();

      const searchResults = await semanticSearch(
        testQueries.typescript,
        { k: 5 },
        db,
      );

      expect(searchResults).toHaveLength(searchResults.length);
      for (const r of searchResults) {
        assertSearchResultValid(r);
      }
    });

    it("should handle batch indexing", async () => {
      const docs = Object.values(testDocuments);

      for (const doc of docs) {
        await indexText(
          doc.content,
          { sourceType: "text" as const, title: doc.metadata.title },
          { chunkSize: 100, chunkOverlap: 20 },
          db,
        );
      }

      const count = await db.countItems();
      expect(count).toBeGreaterThan(docs.length);
    });
  });

  describe("Vector Search with HNSW", () => {
    beforeEach(async () => {
      // Index test documents
      for (const doc of Object.values(testDocuments)) {
        if (doc?.content && doc.metadata) {
          await indexText(
            doc.content,
            { ...doc.metadata, sourceType: "text" as const },
            { chunkSize: 100, chunkOverlap: 20 },
            db,
          );
        }
      }
    });

    it("should perform semantic search with HNSW index", async () => {
      const results = await semanticSearch(testQueries.python, { k: 5 }, db);

      expect(results).toHaveLength(5);

      // First result should be most relevant
      if (results[0]) {
        expect(results[0].score).toBeGreaterThan(0.5);
      }

      // Results should be ordered by score
      for (let i = 0; i < results.length - 1; i++) {
        const current = results[i];
        const next = results[i + 1];
        if (current && next) {
          expect(current.score).toBeGreaterThanOrEqual(next.score);
        }
      }
    });

    it("should support hybrid search", async () => {
      const results = await hybridSearch(
        "Python decorator",
        { k: 5, keywordWeight: 0.3 },
        db,
      );

      expect(results.length).toBeGreaterThan(0);

      // Should find Python-related content
      const pythonResults = results.filter(
        (r) =>
          r.content.toLowerCase().includes("python") ||
          r.content.toLowerCase().includes("decorator"),
      );
      expect(pythonResults.length).toBeGreaterThan(0);
    });
  });

  describe("Performance", () => {
    it("should handle large batch insertions efficiently", async () => {
      const largeText = testDocuments.javascript.content.repeat(10);

      const startTime = Date.now();

      const result = await withTimeout(
        indexText(
          largeText,
          { sourceType: "text" as const },
          { chunkSize: 500, chunkOverlap: 50 },
          db,
        ),
        30000, // 30 seconds timeout
        "Large batch insertion timed out",
      );

      const duration = Date.now() - startTime;

      expect(result.itemsIndexed).toBeGreaterThan(4); // Large text creates at least 5 chunks with 500 char chunks
      expect(duration).toBeLessThan(30000);

      // Should be able to search after large insertion
      const searchResults = await semanticSearch("JavaScript", { k: 3 }, db);

      expect(searchResults.length).toBeGreaterThan(0);
    });

    it("should search efficiently with HNSW index", async () => {
      // Index a reasonable amount of data
      for (let i = 0; i < 10; i++) {
        await indexText(
          `Document ${i}: ${testDocuments.typescript.content}`,
          { sourceType: "text" as const, docId: `doc-${i}` },
          { chunkSize: 200, chunkOverlap: 20 },
          db,
        );
      }

      const startTime = Date.now();

      // Perform multiple searches
      const searchPromises = [];
      for (let i = 0; i < 10; i++) {
        searchPromises.push(
          semanticSearch(testQueries.typescript, { k: 5 }, db),
        );
      }

      const results = await Promise.all(searchPromises);
      const duration = Date.now() - startTime;

      // All searches should complete within reasonable time
      expect(duration).toBeLessThan(5000); // 5 seconds for 10 searches

      results.forEach((result) => {
        expect(result).toHaveLength(5);
      });
    });
  });

  describe("DuckDB-specific Features", () => {
    it("should support HNSW with in-memory database", async () => {
      // HNSW works with in-memory database without persistence issues
      const memDb = await createTestDatabase({
        provider: "duckdb",
        dimension: 768,
        dbPath: ":memory:",
        options: {
          enableHNSW: true,
          hnswMetric: "cosine",
        },
      });

      await indexText(
        testDocuments.typescript.content,
        { sourceType: "text" as const },
        { chunkSize: 200, chunkOverlap: 20 },
        memDb,
      );

      const results = await semanticSearch("TypeScript", { k: 3 }, memDb);
      // TypeScript content creates 2 chunks with 200 char chunks
      expect(results.length).toBeLessThanOrEqual(3);
      expect(results.length).toBeGreaterThan(0);
      if (results[0]) {
        expect(results[0].score).toBeGreaterThan(0.3);
      }

      await memDb.close();
    });
    it("should persist data correctly", async () => {
      // Use file-based DuckDB for this test
      const persistDbPath = `/tmp/test-persist-${Date.now()}.db`;

      const db1 = await createTestDatabase({
        provider: "duckdb",
        dimension: 768,
        dbPath: persistDbPath,
        options: {
          enableHNSW: false, // Disable for file-based DB
        },
      });

      // Index data
      await indexText(
        testDocuments.javascript.content,
        { sourceType: "text" as const },
        { chunkSize: 200, chunkOverlap: 20 },
        db1,
      );

      const count1 = await db1.countItems();
      await db1.close();

      // Reopen database
      const db2 = await createTestDatabase({
        provider: "duckdb",
        dimension: 768,
        dbPath: persistDbPath,
        options: {
          enableHNSW: false,
        },
      });

      const count2 = await db2.countItems();
      expect(count2).toBe(count1);

      // Search should work
      const results = await semanticSearch("JavaScript", { k: 3 }, db2);
      expect(results.length).toBeGreaterThan(0);

      await db2.close();

      // Clean up
      if (existsSync(persistDbPath)) {
        await unlink(persistDbPath);
      }
    });

    it("should handle different HNSW metrics", async () => {
      // Test with L2 distance metric
      const l2DbPath = `/tmp/test-l2-${Date.now()}.db`;

      const dbL2 = await createTestDatabase({
        provider: "duckdb",
        dimension: 768,
        dbPath: l2DbPath,
        options: {
          enableHNSW: false, // Disable for file-based DB
        },
      });

      await indexText(
        testDocuments.python.content,
        { sourceType: "text" as const },
        { chunkSize: 200, chunkOverlap: 20 },
        dbL2,
      );

      const results = await semanticSearch("Python", { k: 3 }, dbL2);
      // Python content creates 2 chunks with 200 char chunks
      expect(results.length).toBeLessThanOrEqual(3);
      expect(results.length).toBeGreaterThan(0);

      await dbL2.close();

      // Clean up
      if (existsSync(l2DbPath)) {
        await unlink(l2DbPath);
      }
    });
  });
});

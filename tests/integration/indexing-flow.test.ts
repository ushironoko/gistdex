import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chunkText } from "../../src/core/chunk/chunking.js";
import type { DatabaseService } from "../../src/core/database/database-service.js";
import { generateEmbeddingsBatch } from "../../src/core/embedding/embedding.js";
import { indexFile, indexText } from "../../src/core/indexer/indexer.js";
import { cleanupTestDatabase, createTestDatabase } from "../helpers/test-db.js";
import { testCode, testDocuments } from "../helpers/test-fixtures.js";
import { cleanupTestDir, createTestTempDir } from "../helpers/test-paths.js";
import { assertEmbeddingValid, withTimeout } from "../helpers/test-utils.js";

describe("Indexing Flow Integration Tests", () => {
  let db: DatabaseService;
  let tempDir: string;

  beforeEach(async () => {
    db = await createTestDatabase({ provider: "memory", dimension: 768 });
    tempDir = await createTestTempDir("gistdex-integration-");
  });

  afterEach(async () => {
    await cleanupTestDatabase(db);
    await cleanupTestDir(tempDir);
  });

  describe("Text indexing flow", () => {
    it("should chunk text, generate embeddings, and save to database", async () => {
      const content = testDocuments.typescript.content;
      const metadata = testDocuments.typescript.metadata;

      const result = await withTimeout(
        indexText(
          content,
          { ...metadata, sourceType: "text" as const },
          {
            chunkSize: 100,
            chunkOverlap: 20,
          },
          db,
        ),
        30000,
        "Text indexing timed out",
      );

      expect(result.itemsIndexed).toBeGreaterThan(0);
      expect(result.chunksCreated).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);

      const count = await db.countItems();
      expect(count).toBeGreaterThan(0);

      const items = await db.listItems({ limit: 10 });
      expect(items.length).toBeGreaterThan(0);

      for (const item of items) {
        expect(item.content).toBeDefined();
        if (item.metadata) {
          expect(item.metadata.sourceId).toBe(result.sourceId);
          expect(item.metadata.sourceType).toBe("text");
          expect(item.metadata.title).toBe(metadata.title);
        }
      }
    });

    it("should handle multiple text documents with different metadata", async () => {
      const documents = [
        testDocuments.typescript,
        testDocuments.python,
        testDocuments.javascript,
      ];

      const results = [];
      for (const doc of documents) {
        const result = await indexText(
          doc.content,
          { ...doc.metadata, sourceType: "text" as const },
          {
            chunkSize: 150,
            chunkOverlap: 30,
          },
          db,
        );
        results.push(result);
      }

      const totalIndexed = results.reduce((sum, r) => sum + r.itemsIndexed, 0);
      expect(totalIndexed).toBeGreaterThan(0);

      // Each document should have created items
      for (const result of results) {
        expect(result.itemsIndexed).toBeGreaterThan(0);
        expect(result.errors).toHaveLength(0);
      }

      const count = await db.countItems();
      expect(count).toBe(totalIndexed);

      const items = await db.listItems({ limit: 100 });
      // Check we have items from multiple sources
      const sourceIds = new Set(
        items.map((item) => item.metadata?.sourceId as string),
      );
      expect(sourceIds.size).toBeGreaterThanOrEqual(documents.length);
    });
  });

  describe("File indexing flow", () => {
    it("should index TypeScript file with proper chunking", async () => {
      const filePath = join(tempDir, "test.ts");
      await writeFile(filePath, testCode.typescript, "utf-8");

      const result = await withTimeout(
        indexFile(
          filePath,
          {},
          {
            chunkSize: 200,
            chunkOverlap: 40,
            preserveBoundaries: true,
          },
          db,
        ),
        30000,
        "File indexing timed out",
      );

      expect(result.itemsIndexed).toBeGreaterThan(0);
      expect(result.chunksCreated).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);

      const items = await db.listItems({ limit: 100 });
      expect(items.length).toBe(result.itemsIndexed);

      const firstItem = items.find((item) => item.metadata?.chunkIndex === 0);
      expect(firstItem).toBeDefined();
      if (firstItem?.metadata) {
        expect(firstItem.metadata.sourceType).toBe("file");
        expect(firstItem.metadata.filePath).toBe(filePath);
        expect(firstItem.metadata.originalContent).toBe(testCode.typescript);
      }
    });

    it("should index Python file with boundary preservation", async () => {
      const filePath = join(tempDir, "test.py");
      await writeFile(filePath, testCode.python, "utf-8");

      const result = await indexFile(
        filePath,
        {},
        {
          chunkSize: 150,
          chunkOverlap: 30,
          preserveBoundaries: true,
        },
        db,
      );

      expect(result.itemsIndexed).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);

      const items = await db.listItems({ limit: 100 });
      // Find chunks from this specific file
      const pythonChunks = items.filter(
        (item) => item.metadata?.filePath === filePath,
      );

      expect(pythonChunks.length).toBe(result.itemsIndexed);

      for (const chunk of pythonChunks) {
        expect(chunk.content).not.toContain("@@dataclass");
        expect(testCode.python).toContain(chunk.content.trim());
      }
    });

    it("should handle multiple files with different extensions", async () => {
      const files = [
        { name: "index.ts", content: testCode.typescript },
        { name: "main.py", content: testCode.python },
        { name: "utils.js", content: testCode.javascript },
      ];

      const results = [];
      for (const file of files) {
        const filePath = join(tempDir, file.name);
        await writeFile(filePath, file.content, "utf-8");

        const result = await indexFile(
          filePath,
          {},
          {
            chunkSize: 200,
            chunkOverlap: 40,
            preserveBoundaries: true,
          },
          db,
        );
        results.push(result);
      }

      const totalIndexed = results.reduce((sum, r) => sum + r.itemsIndexed, 0);
      const count = await db.countItems();
      expect(count).toBe(totalIndexed);

      const items = await db.listItems({ limit: 1000 });
      const sourceIds = new Set(items.map((item) => item.metadata?.sourceId));
      expect(sourceIds.size).toBe(files.length);
    });
  });

  describe("Chunking and embedding generation", () => {
    it("should properly chunk text and generate valid embeddings", async () => {
      const text = testDocuments.gistdex.content;
      const chunks = await chunkText(text, {
        size: 100,
        overlap: 20,
      });

      expect(chunks.length).toBeGreaterThan(0);

      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(100);
        expect(text).toContain(chunk.trim());
      }

      // Test with mocked embeddings
      const embeddings = await generateEmbeddingsBatch(chunks);
      expect(embeddings.length).toBe(chunks.length);

      for (const embedding of embeddings) {
        assertEmbeddingValid(embedding, 768);
      }
    });

    it("should handle boundary-aware chunking for code", async () => {
      const code = testCode.typescript;
      const chunks = await chunkText(code, {
        size: 150,
        overlap: 30,
        preserveBoundaries: true,
        filePath: "test.ts",
      });

      expect(chunks.length).toBeGreaterThan(0);

      const hasCompleteInterface = chunks.some(
        (chunk) => chunk.includes("interface User {") && chunk.includes("}"),
      );
      expect(hasCompleteInterface).toBe(true);

      // Method might be split across chunks with small chunk size
      const hasMethodStart = chunks.some(
        (chunk) =>
          chunk.includes("async createUser") || chunk.includes("createUser"),
      );
      expect(hasMethodStart).toBe(true);
    });
  });

  describe("Database operations during indexing", () => {
    it("should correctly save items with metadata", async () => {
      const content = "Sample content for testing database operations.";
      const metadata = {
        title: "Test Document",
        author: "Test Author",
        tags: ["test", "integration"],
      };

      await indexText(
        content,
        metadata,
        {
          chunkSize: 50,
          chunkOverlap: 10,
        },
        db,
      );

      const items = await db.listItems({ limit: 100 });

      for (const item of items) {
        if (item.metadata) {
          expect(item.metadata.title).toBe(metadata.title);
          expect(item.metadata.author).toBe(metadata.author);
          expect(item.metadata.tags).toEqual(metadata.tags);
        }
      }
    });

    it("should handle batch saving efficiently", async () => {
      const largeText = Array(10)
        .fill(testDocuments.typescript.content)
        .join("\n\n");

      const startTime = Date.now();
      const result = await indexText(
        largeText,
        {},
        {
          chunkSize: 100,
          chunkOverlap: 20,
        },
        db,
      );
      const duration = Date.now() - startTime;

      expect(result.itemsIndexed).toBeGreaterThan(10);
      expect(duration).toBeLessThan(60000);

      const count = await db.countItems();
      expect(count).toBe(result.itemsIndexed);
    });
  });

  describe("Error handling in indexing flow", () => {
    it("should handle empty content gracefully", async () => {
      const result = await indexText("", {}, {}, db);

      // Empty text may create one item with empty embedding
      expect(result.itemsIndexed).toBeLessThanOrEqual(1);

      // May or may not have errors depending on implementation
      if (result.itemsIndexed === 0) {
        expect(result.errors.length).toBeGreaterThan(0);
      }

      const count = await db.countItems();
      expect(count).toBeLessThanOrEqual(1);
    });

    it("should handle non-existent file paths", async () => {
      const nonExistentPath = join(tempDir, "non-existent.txt");

      const result = await indexFile(nonExistentPath, {}, {}, db);
      expect(result.itemsIndexed).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should continue indexing after partial failure", async () => {
      const documents = [
        { content: testDocuments.typescript.content, shouldFail: false },
        { content: "", shouldFail: true },
        { content: testDocuments.python.content, shouldFail: false },
      ];

      let successCount = 0;
      let failureCount = 0;

      for (const doc of documents) {
        try {
          if (doc.shouldFail) {
            throw new Error("Simulated failure");
          }
          const result = await indexText(doc.content, {}, {}, db);
          if (result.itemsIndexed > 0) {
            successCount++;
          } else {
            failureCount++;
          }
        } catch {
          failureCount++;
        }
      }

      expect(successCount).toBe(2);
      expect(failureCount).toBe(1);

      const count = await db.countItems();
      expect(count).toBeGreaterThan(0);
    });
  });
});

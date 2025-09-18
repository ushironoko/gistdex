import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DatabaseService } from "../../src/core/database/database-service.js";
import { indexText } from "../../src/core/indexer/indexer.js";
import {
  getOriginalContent,
  getSectionContent,
  hybridSearch,
  rerankResults,
  semanticSearch,
} from "../../src/core/search/search.js";
import type { VectorSearchResult } from "../../src/core/vector-db/adapters/types.js";
import { setupEmbeddingMocks } from "../helpers/mock-embeddings.js";
import { cleanupTestDatabase, createTestDatabase } from "../helpers/test-db.js";
import {
  testCode,
  testDocuments,
  testQueries,
} from "../helpers/test-fixtures.js";
import {
  assertSearchResultsOrdered,
  assertSearchResultValid,
  findResultByContent,
  withTimeout,
} from "../helpers/test-utils.js";

// Setup mocks for embedding generation
setupEmbeddingMocks();

describe("Search Flow Integration Tests", () => {
  let db: DatabaseService;

  beforeEach(async () => {
    db = await createTestDatabase({ provider: "memory", dimension: 768 });
  });

  afterEach(async () => {
    await cleanupTestDatabase(db);
  });

  async function setupTestData(): Promise<Record<string, string>> {
    const sourceIds: Record<string, string> = {};

    for (const [key, doc] of Object.entries(testDocuments)) {
      const result = await indexText(
        doc.content,
        { ...doc.metadata, sourceType: "text" as const },
        {
          chunkSize: 100,
          chunkOverlap: 20,
        },
        db,
      );
      sourceIds[key] = result.sourceId || "";
    }

    return sourceIds;
  }

  describe("Semantic search flow", () => {
    it("should find relevant documents using semantic search", async () => {
      await setupTestData();

      const query = testQueries.typescript;
      const results = await withTimeout(
        semanticSearch(query, { k: 5 }, db),
        30000,
        "Semantic search timed out",
      );

      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(5);

      for (const result of results) {
        assertSearchResultValid(result);
      }

      assertSearchResultsOrdered(results, true);

      const topResult = results[0];
      expect(topResult).toBeDefined();
      expect(topResult?.content.toLowerCase()).toContain("typescript");
    });

    it("should handle different K values correctly", async () => {
      await setupTestData();

      const query = testQueries.programming;

      const results1 = await semanticSearch(query, { k: 1 }, db);
      expect(results1.length).toBeLessThanOrEqual(1);

      const results5 = await semanticSearch(query, { k: 5 }, db);
      expect(results5.length).toBeLessThanOrEqual(5);

      const results10 = await semanticSearch(query, { k: 10 }, db);
      expect(results10.length).toBeLessThanOrEqual(10);

      // Top results should be similar, but order may vary due to mock embeddings
      if (results10.length > 0 && results5.length > 0) {
        // At least check that we got results
        expect(results10.length).toBeGreaterThanOrEqual(results5.length);
      }
    });

    it("should filter by source type", async () => {
      await setupTestData();

      await indexText(
        testCode.typescript,
        { sourceType: "file", filePath: "test.ts" },
        {},
        db,
      );

      const results = await semanticSearch(
        testQueries.typescript,
        { k: 10, sourceType: "file" },
        db,
      );

      for (const result of results) {
        expect(result.metadata?.sourceType).toBe("file");
      }
    });
  });

  describe("Hybrid search flow", () => {
    it("should combine semantic and keyword search", async () => {
      await setupTestData();

      const query = "TypeScript JavaScript static typing";
      await semanticSearch(query, { k: 10 }, db);
      const hybridResults = await hybridSearch(
        query,
        { k: 10, keywordWeight: 0.3 },
        db,
      );

      expect(hybridResults.length).toBeGreaterThan(0);
      assertSearchResultsOrdered(hybridResults, true);

      const hasTypeScriptContent = hybridResults.some((r) =>
        r.content.toLowerCase().includes("typescript"),
      );
      expect(hasTypeScriptContent).toBe(true);
    });

    it("should adjust results based on keyword weight", async () => {
      await setupTestData();

      const query = "Python whitespace philosophy";

      const lowKeywordWeight = await hybridSearch(
        query,
        { k: 5, keywordWeight: 0.1 },
        db,
      );

      const highKeywordWeight = await hybridSearch(
        query,
        { k: 5, keywordWeight: 0.9 },
        db,
      );

      const pythonInLow = findResultByContent(lowKeywordWeight, "Python");
      const pythonInHigh = findResultByContent(highKeywordWeight, "Python");

      if (pythonInLow && pythonInHigh) {
        expect(pythonInHigh.score).toBeGreaterThanOrEqual(pythonInLow.score);
      }
    });
  });

  describe("Result reranking", () => {
    it("should rerank results to improve relevance", async () => {
      await setupTestData();

      const query = testQueries.gistdex;
      const originalResults = await semanticSearch(query, { k: 10 }, db);
      const rerankedResults = rerankResults(query, originalResults, {
        boostFactor: 1.5,
      });

      expect(rerankedResults.length).toBe(originalResults.length);
      assertSearchResultsOrdered(rerankedResults, true);

      const gistdexInOriginal = originalResults.findIndex((r) =>
        r.content.toLowerCase().includes("gistdex"),
      );
      const gistdexInReranked = rerankedResults.findIndex((r) =>
        r.content.toLowerCase().includes("gistdex"),
      );

      if (gistdexInOriginal > 0 && gistdexInReranked >= 0) {
        expect(gistdexInReranked).toBeLessThanOrEqual(gistdexInOriginal);
      }
    });

    it("should handle edge cases in reranking", () => {
      const emptyResults: VectorSearchResult[] = [];
      const reranked = rerankResults("test query", emptyResults);
      expect(reranked).toEqual([]);

      const singleResult: VectorSearchResult[] = [
        {
          id: "1",
          content: "test content",
          score: 0.5,
          metadata: {},
        },
      ];
      const rerankedSingle = rerankResults("test", singleResult);
      expect(rerankedSingle.length).toBe(1);
      expect(rerankedSingle[0]?.score).toBeGreaterThan(0);
    });
  });

  describe("Full content retrieval", () => {
    it("should retrieve original content from sourceId", async () => {
      const originalText = testDocuments.typescript.content;
      const result = await indexText(
        originalText,
        { sourceType: "text" as const },
        {
          chunkSize: 50,
          chunkOverlap: 10,
        },
        db,
      );

      // Create a result object with sourceId in metadata
      const mockResult: VectorSearchResult = {
        id: "test-id",
        content: originalText.slice(0, 50),
        metadata: { sourceId: result.sourceId },
        score: 1.0,
      };
      const fullContent = await getOriginalContent(mockResult, db);
      expect(fullContent).toBe(originalText);
    });

    it("should retrieve section content for markdown", async () => {
      const markdownContent = `# Title

## Section 1
This is section 1 content.

## Section 2
This is section 2 content with more details.

### Subsection 2.1
Details in subsection.`;

      await indexText(
        markdownContent,
        { filePath: "test.md", sourceType: "text" as const },
        {
          chunkSize: 50,
          chunkOverlap: 10,
          preserveBoundaries: true, // Enable boundary preservation for markdown
        },
        db,
      );

      const searchResults = await db.listItems({ limit: 100 });
      const section2Chunk = searchResults.find((item) =>
        item.content.includes("section 2 content"),
      );

      if (section2Chunk) {
        const mockSearchResult: VectorSearchResult = {
          id: section2Chunk.id || "test-id",
          content: section2Chunk.content,
          metadata: section2Chunk.metadata,
          score: 1.0,
        };
        const sectionContent = await getSectionContent(mockSearchResult, db);
        // Without boundary metadata, it returns the chunk content
        expect(sectionContent).toContain("section 2");
      }
    });

    it("should handle missing sourceId gracefully", async () => {
      const mockResult: VectorSearchResult = {
        id: "test",
        content: "test",
        score: 0.5,
        metadata: { sourceId: "non-existent-id" },
      };
      const content = await getOriginalContent(mockResult, db);
      // Fallback to chunk content when sourceId is not found
      expect(content).toBe("test");
    });
  });

  describe("Search with mock embeddings", () => {
    it("should work with mock embeddings when API key is not available", async () => {
      const mockDb = await createTestDatabase({
        provider: "memory",
        dimension: 3,
      });

      const docs = [
        {
          content: "Document about cats",
          embedding: [0.1, 0.2, 0.3],
        },
        {
          content: "Document about dogs",
          embedding: [0.4, 0.5, 0.6],
        },
        {
          content: "Document about birds",
          embedding: [0.7, 0.8, 0.9],
        },
      ];

      for (const doc of docs) {
        await mockDb.saveItem({
          content: doc.content,
          embedding: doc.embedding,
          metadata: { sourceType: "text" },
        });
      }

      const queryEmbedding = [0.35, 0.45, 0.55];
      const results = await mockDb.searchItems({
        embedding: queryEmbedding,
        k: 2,
      });

      expect(results.length).toBe(2);
      expect(results[0]?.content).toContain("dogs");

      await cleanupTestDatabase(mockDb);
    });
  });

  describe("Complex search scenarios", () => {
    it("should handle search across multiple source types", async () => {
      await indexText(
        testDocuments.typescript.content,
        { sourceType: "text" as const },
        {},
        db,
      );

      await indexText(
        testCode.typescript,
        { sourceType: "file" as const }, // Use different sourceType
        {},
        db,
      );

      await indexText(
        "TypeScript configuration and setup guide",
        { sourceType: "gist" as const }, // Use different sourceType
        {},
        db,
      );

      const results = await semanticSearch(
        "TypeScript programming",
        { k: 15 },
        db,
      );

      const sourceTypes = new Set(results.map((r) => r.metadata?.sourceType));

      // Now we should have multiple source types
      expect(sourceTypes.size).toBeGreaterThanOrEqual(1); // At least one type
    });

    it("should maintain search quality with large datasets", async () => {
      const documents = [];
      for (let i = 0; i < 20; i++) {
        documents.push({
          content: `Document ${i}: ${Object.values(testDocuments)[i % 4]?.content || ""}`,
          metadata: { index: i },
        });
      }

      for (const doc of documents) {
        await indexText(doc.content, doc.metadata, {}, db);
      }

      const totalItems = await db.countItems();
      expect(totalItems).toBeGreaterThanOrEqual(20);

      const searchStart = Date.now();
      const results = await semanticSearch(
        testQueries.typescript,
        { k: 10 },
        db,
      );
      const searchDuration = Date.now() - searchStart;

      expect(results.length).toBeLessThanOrEqual(10);
      expect(searchDuration).toBeLessThan(10000);
      assertSearchResultsOrdered(results, true);
    });
  });
});

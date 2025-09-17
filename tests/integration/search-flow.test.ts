import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import {
  createTestDatabase,
  cleanupTestDatabase,
  createMockEmbedding,
  createSimilarEmbedding,
} from "../helpers/test-db.js";
import {
  testDocuments,
  testQueries,
  testCode,
} from "../helpers/test-fixtures.js";
import {
  assertSearchResultValid,
  assertSearchResultsOrdered,
  withTimeout,
  extractContentFromResults,
  findResultByContent,
} from "../helpers/test-utils.js";
import { indexText } from "../../src/core/indexer/indexer.js";
import {
  semanticSearch,
  hybridSearch,
  rerankResults,
  getOriginalContent,
  getSectionContent,
} from "../../src/core/search/search.js";
import { generateEmbedding } from "../../src/core/embedding/embedding.js";
import type { DatabaseService } from "../../src/core/database/database-service.js";
import type { VectorSearchResult } from "../../src/core/vector-db/adapters/types.js";

describe("Search Flow Integration Tests", () => {
  let db: DatabaseService;
  const hasApiKey = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  beforeAll(() => {
    if (!hasApiKey) {
      console.warn(
        "GOOGLE_GENERATIVE_AI_API_KEY not set. Skipping some search tests.",
      );
    }
  });

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
        {
          chunkSize: 100,
          chunkOverlap: 20,
          metadata: doc.metadata,
        },
        db,
      );
      sourceIds[key] = result.sourceId;
    }

    return sourceIds;
  }

  describe("Semantic search flow", () => {
    it("should find relevant documents using semantic search", async function () {
      if (!hasApiKey) {
        this.skip();
      }

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
      expect(topResult.content.toLowerCase()).toContain("typescript");
    });

    it("should handle different K values correctly", async function () {
      if (!hasApiKey) {
        this.skip();
      }

      await setupTestData();

      const query = testQueries.programming;

      const results1 = await semanticSearch(query, { k: 1 }, db);
      expect(results1.length).toBeLessThanOrEqual(1);

      const results5 = await semanticSearch(query, { k: 5 }, db);
      expect(results5.length).toBeLessThanOrEqual(5);

      const results10 = await semanticSearch(query, { k: 10 }, db);
      expect(results10.length).toBeLessThanOrEqual(10);

      if (results10.length > 5) {
        expect(results10.slice(0, 5)).toEqual(results5);
      }
    });

    it("should filter by source type", async function () {
      if (!hasApiKey) {
        this.skip();
      }

      await setupTestData();

      const fileResult = await indexText(
        testCode.typescript,
        {
          metadata: { sourceType: "file", filePath: "test.ts" },
        },
        db,
      );

      const results = await semanticSearch(
        testQueries.typescript,
        { k: 10, sourceType: "file" },
        db,
      );

      for (const result of results) {
        expect(result.metadata.sourceType).toBe("file");
      }
    });
  });

  describe("Hybrid search flow", () => {
    it("should combine semantic and keyword search", async function () {
      if (!hasApiKey) {
        this.skip();
      }

      await setupTestData();

      const query = "TypeScript JavaScript static typing";
      const semanticResults = await semanticSearch(query, { k: 10 }, db);
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

    it("should adjust results based on keyword weight", async function () {
      if (!hasApiKey) {
        this.skip();
      }

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
    it("should rerank results to improve relevance", async function () {
      if (!hasApiKey) {
        this.skip();
      }

      await setupTestData();

      const query = testQueries.gistdex;
      const originalResults = await semanticSearch(query, { k: 10 }, db);
      const rerankedResults = rerankResults(originalResults, query, {
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
      const reranked = rerankResults(emptyResults, "test query");
      expect(reranked).toEqual([]);

      const singleResult: VectorSearchResult[] = [
        {
          id: "1",
          content: "test content",
          score: 0.5,
          metadata: {},
        },
      ];
      const rerankedSingle = rerankResults(singleResult, "test");
      expect(rerankedSingle.length).toBe(1);
      expect(rerankedSingle[0].score).toBeGreaterThan(0);
    });
  });

  describe("Full content retrieval", () => {
    it("should retrieve original content from sourceId", async () => {
      const originalText = testDocuments.typescript.content;
      const result = await indexText(
        originalText,
        {
          chunkSize: 50,
          chunkOverlap: 10,
        },
        db,
      );

      const fullContent = await getOriginalContent(result.sourceId, db);
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

      const result = await indexText(
        markdownContent,
        {
          chunkSize: 50,
          chunkOverlap: 10,
          metadata: { filePath: "test.md" },
        },
        db,
      );

      const searchResults = await db.listItems({ limit: 100 });
      const section2Chunk = searchResults.find((item) =>
        item.content.includes("section 2 content"),
      );

      if (section2Chunk) {
        const sectionContent = await getSectionContent(
          section2Chunk.metadata as any,
          result.sourceId,
          db,
        );
        expect(sectionContent).toContain("Section 2");
        expect(sectionContent).toContain("Subsection 2.1");
      }
    });

    it("should handle missing sourceId gracefully", async () => {
      const content = await getOriginalContent("non-existent-id", db);
      expect(content).toBeNull();
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
      expect(results[0].content).toContain("dogs");

      await cleanupTestDatabase(mockDb);
    });
  });

  describe("Complex search scenarios", () => {
    it("should handle search across multiple source types", async function () {
      if (!hasApiKey) {
        this.skip();
      }

      await indexText(
        testDocuments.typescript.content,
        { metadata: { sourceType: "documentation" } },
        db,
      );

      await indexText(
        testCode.typescript,
        { metadata: { sourceType: "code" } },
        db,
      );

      await indexText(
        "TypeScript configuration and setup guide",
        { metadata: { sourceType: "tutorial" } },
        db,
      );

      const results = await semanticSearch(
        "TypeScript programming",
        { k: 15 },
        db,
      );

      const sourceTypes = new Set(results.map((r) => r.metadata.sourceType));

      expect(sourceTypes.size).toBeGreaterThanOrEqual(2);
    });

    it("should maintain search quality with large datasets", async function () {
      if (!hasApiKey) {
        this.skip();
      }

      const documents = [];
      for (let i = 0; i < 20; i++) {
        documents.push({
          content: `Document ${i}: ${Object.values(testDocuments)[i % 4].content}`,
          metadata: { index: i },
        });
      }

      for (const doc of documents) {
        await indexText(doc.content, { metadata: doc.metadata }, db);
      }

      const totalItems = await db.countItems();
      expect(totalItems).toBeGreaterThan(20);

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

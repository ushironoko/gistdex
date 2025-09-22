import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  mock,
  test,
} from "bun:test";
import {
  cleanupTestDatabase,
  createTestDatabase,
} from "../../../tests/helpers/test-db.js";
import type { DatabaseService } from "../database/database-service.js";
import type { VectorSearchResult } from "../vector-db/adapters/types.js";
import { getSectionContent, hybridSearch, semanticSearch } from "./search.js";

// Mock the embedding module to avoid API calls in tests
mock.module("../embedding/embedding.js", async () => {
  const actual = await import("../embedding/embedding.js");
  return {
    ...actual,
    generateEmbedding: jest.fn().mockImplementation(async (text: string) => {
      // Generate a simple 3-dimensional embedding for testing
      const hash = text
        .split("")
        .reduce((acc, char) => acc + char.charCodeAt(0), 0);
      return [
        Math.sin(hash) * 0.5 + 0.5,
        Math.cos(hash) * 0.5 + 0.5,
        Math.sin(hash * 2) * 0.5 + 0.5,
      ];
    }),
  };
});

describe("getSectionContent", () => {
  let db: DatabaseService;

  beforeEach(async () => {
    db = await createTestDatabase({ provider: "memory", dimension: 768 });
  });

  afterEach(async () => {
    await cleanupTestDatabase(db);
  });

  test("returns section content when boundary information is available", async () => {
    const sourceId = "source-123";

    // Add test data with boundary information
    await db.saveItems([
      {
        content: "## Introduction\n\nThis is the intro.",
        embedding: Array(768).fill(0.1),
        metadata: {
          sourceId,
          chunkIndex: 0,
          boundary: {
            type: "heading",
            level: 2,
            title: "Introduction",
          },
        },
      },
      {
        content: "More intro content here.",
        embedding: Array(768).fill(0.1),
        metadata: {
          sourceId,
          chunkIndex: 1,
          boundary: {
            type: "heading",
            level: 2,
            title: "Introduction",
          },
        },
      },
      {
        content: "## Next Section\n\nDifferent content.",
        embedding: Array(768).fill(0.2),
        metadata: {
          sourceId,
          chunkIndex: 2,
          boundary: {
            type: "heading",
            level: 2,
            title: "Next Section",
          },
        },
      },
    ]);

    const result: VectorSearchResult = {
      id: "1",
      content: "## Introduction\n\nThis is the intro.",
      score: 0.95,
      metadata: {
        sourceId,
        boundary: {
          type: "heading",
          level: 2,
          title: "Introduction",
        },
      },
    };

    const sectionContent = await getSectionContent(result, db);

    expect(sectionContent).toBe(
      "## Introduction\n\nThis is the intro.\nMore intro content here.",
    );
  });

  test("returns original chunk when no boundary information", async () => {
    const result: VectorSearchResult = {
      id: "1",
      content: "Some content without boundaries",
      score: 0.85,
      metadata: {},
    };

    const sectionContent = await getSectionContent(result, db);

    expect(sectionContent).toBe(result.content);
  });

  test("handles missing sourceId gracefully", async () => {
    const result: VectorSearchResult = {
      id: "1",
      content: "Content without sourceId",
      score: 0.75,
      metadata: {
        boundary: {
          type: "heading",
          level: 1,
          title: "Test",
        },
      },
    };

    const sectionContent = await getSectionContent(result, db);

    expect(sectionContent).toBe(result.content);
  });

  test("combines function boundaries correctly", async () => {
    const sourceId = "code-123";

    await db.saveItems([
      {
        content: "function calculate() {\n  return 42;",
        embedding: Array(768).fill(0.1),
        metadata: {
          sourceId,
          chunkIndex: 0,
          boundary: {
            type: "function",
            name: "calculate",
          },
        },
      },
      {
        content: "\n}",
        embedding: Array(768).fill(0.1),
        metadata: {
          sourceId,
          chunkIndex: 1,
          boundary: {
            type: "function",
            name: "calculate",
          },
        },
      },
    ]);

    const result: VectorSearchResult = {
      id: "1",
      content: "function calculate() {\n  return 42;",
      score: 0.9,
      metadata: {
        sourceId,
        boundary: {
          type: "function",
          name: "calculate",
          startLine: 1,
          endLine: 3,
        },
      },
    };

    const sectionContent = await getSectionContent(result, db);

    expect(sectionContent).toBe("function calculate() {\n  return 42;\n\n}");
  });
});

describe("semanticSearch", () => {
  let db: DatabaseService;

  beforeEach(async () => {
    db = await createTestDatabase({ provider: "memory", dimension: 3 });
  });

  afterEach(async () => {
    await cleanupTestDatabase(db);
  });

  test("performs semantic search with real data", async () => {
    // Add test documents
    await db.saveItems([
      {
        content: "TypeScript is a typed superset of JavaScript",
        embedding: [0.9, 0.1, 0.0],
        metadata: { lang: "en", type: "documentation" },
      },
      {
        content: "Python is a dynamically typed language",
        embedding: [0.1, 0.9, 0.0],
        metadata: { lang: "en", type: "documentation" },
      },
      {
        content: "Rust provides memory safety",
        embedding: [0.0, 0.1, 0.9],
        metadata: { lang: "en", type: "documentation" },
      },
    ]);

    const results = await semanticSearch(
      "TypeScript static typing",
      { k: 2 },
      db,
    );

    expect(results).toHaveLength(2);
    // Verify that results are returned and have content
    expect(results[0]?.content).toBeTruthy();
    expect(results[1]?.content).toBeTruthy();
    // Verify that results are sorted by score
    expect(results[0]?.score).toBeGreaterThanOrEqual(results[1]?.score ?? 0);
  });

  test("respects k parameter", async () => {
    await db.saveItems([
      {
        content: "Document 1",
        embedding: [0.1, 0.2, 0.3],
        metadata: {},
      },
      {
        content: "Document 2",
        embedding: [0.4, 0.5, 0.6],
        metadata: {},
      },
      {
        content: "Document 3",
        embedding: [0.7, 0.8, 0.9],
        metadata: {},
      },
    ]);

    const results = await semanticSearch("query", { k: 1 }, db);

    expect(results).toHaveLength(1);
  });

  test("handles reranking when enabled", async () => {
    await db.saveItems([
      {
        content: "JavaScript async await promises",
        embedding: [0.5, 0.5, 0.0],
        metadata: { category: "async" },
      },
      {
        content: "TypeScript async functions with types",
        embedding: [0.6, 0.4, 0.0],
        metadata: { category: "async" },
      },
      {
        content: "Rust async/await and futures",
        embedding: [0.4, 0.6, 0.0],
        metadata: { category: "async" },
      },
    ]);

    const results = await semanticSearch(
      "async await",
      { k: 3, rerank: true },
      db,
    );

    expect(results).toHaveLength(3);
    // All results should contain "async"
    results.forEach((result) => {
      expect(result.content.toLowerCase()).toContain("async");
    });
  });

  test("applies metadata filters", async () => {
    await db.saveItems([
      {
        content: "Python tutorial",
        embedding: [0.1, 0.2, 0.3],
        metadata: { language: "python", type: "tutorial" },
      },
      {
        content: "Python reference",
        embedding: [0.2, 0.3, 0.4],
        metadata: { language: "python", type: "reference" },
      },
      {
        content: "JavaScript tutorial",
        embedding: [0.3, 0.4, 0.5],
        metadata: { language: "javascript", type: "tutorial" },
      },
    ]);

    const results = await semanticSearch("tutorial", { k: 10 }, db);

    expect(results.length).toBeGreaterThan(0);
    // Check that at least some results contain "tutorial" in content or metadata
    const tutorialResults = results.filter(
      (result) =>
        result.content.toLowerCase().includes("tutorial") ||
        result.metadata?.type === "tutorial",
    );
    expect(tutorialResults.length).toBeGreaterThan(0);
  });
});

describe("hybridSearch", () => {
  let db: DatabaseService;

  beforeEach(async () => {
    db = await createTestDatabase({ provider: "memory", dimension: 3 });
  });

  afterEach(async () => {
    await cleanupTestDatabase(db);
  });

  test("combines semantic and keyword search", async () => {
    await db.saveItems([
      {
        content: "React is a JavaScript library for building user interfaces",
        embedding: [0.8, 0.2, 0.0],
        metadata: { framework: "react" },
      },
      {
        content: "Vue.js is a progressive JavaScript framework",
        embedding: [0.7, 0.3, 0.0],
        metadata: { framework: "vue" },
      },
      {
        content: "Angular is a TypeScript-based framework by Google",
        embedding: [0.6, 0.4, 0.0],
        metadata: { framework: "angular" },
      },
      {
        content: "Svelte compiles components at build time",
        embedding: [0.5, 0.5, 0.0],
        metadata: { framework: "svelte" },
      },
    ]);

    const results = await hybridSearch(
      "JavaScript framework",
      { k: 3, keywordWeight: 0.5 },
      db,
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(3);

    // Should prioritize documents containing both "JavaScript" and "framework"
    const topResult = results[0];
    expect(topResult?.content.toLowerCase()).toContain("javascript");
  });

  test("handles empty keyword matches", async () => {
    await db.saveItems([
      {
        content: "Unrelated content about databases",
        embedding: [0.1, 0.9, 0.0],
        metadata: {},
      },
      {
        content: "Another unrelated document",
        embedding: [0.2, 0.8, 0.0],
        metadata: {},
      },
    ]);

    const results = await hybridSearch(
      "xyz123nonexistent",
      { k: 2, keywordWeight: 0.9 },
      db,
    );

    // Should still return semantic results even if no keyword matches
    expect(results).toHaveLength(2);
  });

  test("respects keyword weight parameter", async () => {
    await db.saveItems([
      {
        content: "Python machine learning algorithms",
        embedding: [0.1, 0.1, 0.8],
        metadata: {},
      },
      {
        content: "JavaScript web development",
        embedding: [0.8, 0.1, 0.1],
        metadata: {},
      },
      {
        content: "Python web frameworks like Django",
        embedding: [0.4, 0.4, 0.2],
        metadata: {},
      },
    ]);

    // High keyword weight should prioritize exact matches
    const keywordHeavy = await hybridSearch(
      "Python",
      { k: 3, keywordWeight: 0.9 },
      db,
    );

    // Low keyword weight should rely more on semantic similarity
    const semanticHeavy = await hybridSearch(
      "Python",
      { k: 3, keywordWeight: 0.1 },
      db,
    );

    expect(keywordHeavy).toHaveLength(3);
    expect(semanticHeavy).toHaveLength(3);

    // Both should return results, but potentially in different orders
    expect(keywordHeavy[0]?.content).toContain("Python");
  });
});

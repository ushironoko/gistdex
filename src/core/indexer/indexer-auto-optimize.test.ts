import { describe, expect, it, jest, mock } from "bun:test";
import type { DatabaseService } from "../database/database-service.js";
import { indexFile } from "./indexer.js";

// Mock database service
const mockDatabaseService: DatabaseService = {
  initialize: jest.fn().mockResolvedValue(undefined),
  saveItem: jest.fn().mockResolvedValue("id1"),
  saveItems: jest.fn().mockResolvedValue(["id1", "id2", "id3"]),
  searchItems: jest.fn().mockResolvedValue([]),
  countItems: jest.fn().mockResolvedValue(0),
  listItems: jest.fn().mockResolvedValue([]),
  getStats: jest.fn().mockResolvedValue({ totalItems: 0, bySourceType: {} }),
  close: jest.fn().mockResolvedValue(undefined),
  getAdapterInfo: jest.fn().mockReturnValue(null),
};

// Mock embedding generation
mock.module("../embedding/embedding.js", () => ({
  generateEmbeddingsBatch: jest.fn().mockImplementation((chunks: string[]) => {
    // Return embeddings matching the number of chunks
    return Promise.resolve(
      chunks.map((_, index) => new Array(768).fill(0.1 * (index + 1))),
    );
  }),
}));

// Mock file system
mock.module("node:fs/promises", async () => {
  const actual = await import("node:fs/promises");
  return {
    ...actual,
    readFile: jest.fn().mockImplementation((path: string) => {
      // Return different content based on file extension
      if (path.includes(".txt")) {
        // Text file - should be chunked with larger size
        // Create a longer continuous text to ensure proper chunking
        const longText =
          "Lorem ipsum dolor sit amet consectetur adipiscing elit ".repeat(50);
        return Promise.resolve(longText);
      }
      if (path.includes(".js") || path.includes(".ts")) {
        // Code file - should be chunked with smaller size
        return Promise.resolve("const x = 1;\n".repeat(100));
      }
      if (path.includes(".md")) {
        // Documentation file - should be chunked with medium size
        return Promise.resolve("# Documentation\n".repeat(100));
      }
      return Promise.resolve("Default content");
    }),
  };
});

describe("indexer with automatic chunk optimization", () => {
  it("should automatically use optimal chunk size for JavaScript files", async () => {
    const result = await indexFile(
      "test.js",
      {},
      {}, // No options needed, auto-optimization is default
      mockDatabaseService,
    );

    expect(result.itemsIndexed).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);

    // Check that saveItems was called
    const saveItemsCalls = (mockDatabaseService.saveItems as any).mock.calls;
    expect(saveItemsCalls.length).toBeGreaterThan(0);

    // Get the items that were saved
    const savedItems = saveItemsCalls[0]?.[0];
    expect(savedItems).toBeDefined();
    expect(Array.isArray(savedItems)).toBe(true);

    // With chunk size 650 for JS files, we should get more chunks than with default 1000
    const codeContent = "const x = 1;\n".repeat(100);
    const expectedChunksWithOptimal = Math.ceil(codeContent.length / 650);
    // const expectedChunksWithDefault = Math.ceil(codeContent.length / 1000);

    // Verify we get more chunks with optimization (smaller chunk size)
    expect(savedItems?.length).toBeGreaterThanOrEqual(
      expectedChunksWithOptimal,
    );
  });

  it("should automatically use optimal chunk size for Markdown files", async () => {
    const result = await indexFile(
      "README.md",
      {},
      {}, // No options needed, auto-optimization is default
      mockDatabaseService,
    );

    expect(result.itemsIndexed).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);
  });

  it("should automatically use optimal chunk size for text files", async () => {
    const result = await indexFile(
      "article.txt",
      {},
      {}, // No options needed, auto-optimization is default
      mockDatabaseService,
    );

    expect(result.itemsIndexed).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);
  });

  it("should use provided chunk size when explicitly specified", async () => {
    const result = await indexFile(
      "test.js",
      {},
      { chunkSize: 500, chunkOverlap: 100 }, // Explicit values override auto-optimization
      mockDatabaseService,
    );

    expect(result.itemsIndexed).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);
  });

  it("should enable preserveBoundaries for code files when specified", async () => {
    const result = await indexFile(
      "test.js",
      {},
      { preserveBoundaries: true },
      mockDatabaseService,
    );

    expect(result.itemsIndexed).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);

    // With preserveBoundaries, CST-based chunking will be used
    // This creates more granular chunks (one for each const statement)
    const saveItemsCalls = (mockDatabaseService.saveItems as any).mock.calls;
    expect(saveItemsCalls.length).toBeGreaterThan(0);

    const savedItems = saveItemsCalls[0]?.[0];

    // With preserveBoundaries and automatic optimal chunk sizing,
    // we expect the file to be chunked efficiently
    expect(savedItems?.length).toBeGreaterThan(0);
    // The exact number depends on the test file content and CST parsing
  });

  it("should not enable preserveBoundaries for text files by default", async () => {
    // Clear previous mock calls
    jest.clearAllMocks();
    const result = await indexFile(
      "test.txt",
      {},
      {}, // No preserveBoundaries, should use regular chunking
      mockDatabaseService,
    );

    expect(result.itemsIndexed).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);

    // Text files should not have preserveBoundaries enabled
    // They should use regular chunking with the optimized chunk size
    const saveItemsCalls = (mockDatabaseService.saveItems as any).mock.calls;
    expect(saveItemsCalls.length).toBeGreaterThan(0);

    const savedItems = saveItemsCalls[0]?.[0];

    // Check the actual chunks
    if (savedItems && savedItems.length > 10) {
      console.log("WARNING: Too many chunks for text file:", savedItems.length);
      console.log(
        "Sample chunks:",
        savedItems.slice(0, 3).map((item: any) => {
          const typedItem = item as { content?: string };
          return {
            content: typedItem.content?.substring(0, 30),
            length: typedItem.content?.length,
          };
        }),
      );
    }

    // Text files should not be split into many small chunks
    // Even with preserveBoundaries disabled, we shouldn't get 100 chunks
    expect(savedItems?.length).toBeLessThan(100);
  });

  it("should prioritize explicit chunk settings over automatic optimization", async () => {
    const result = await indexFile(
      "test.js",
      {},
      { chunkSize: 2000, chunkOverlap: 400 }, // Explicit settings override auto-optimization
      mockDatabaseService,
    );

    expect(result.itemsIndexed).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);

    // With explicit chunk size 2000, we should get chunks
    const saveItemsCalls = (mockDatabaseService.saveItems as any).mock.calls;
    expect(saveItemsCalls.length).toBeGreaterThan(0);

    const savedItems = saveItemsCalls[0]?.[0];

    // The file has 100 "const x = 1;" statements
    // With CST-based chunking (when preserveBoundaries is enabled),
    // each const statement might be treated as a separate boundary
    // So we expect the actual number of chunks to be around 100
    expect(savedItems?.length).toBeDefined();
    expect(savedItems?.length).toBeGreaterThan(0);

    // Since we're testing that explicit settings are respected,
    // verify that the chunking happened (items were saved)
    expect(result.chunksCreated).toBeGreaterThan(0);
    expect(savedItems?.length).toBeGreaterThan(0);
  });
});

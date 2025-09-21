import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../database/database-service.js";
import type { VectorSearchResult } from "../vector-db/adapters/types.js";
import { analyzeDocuments, type DocAnalysisResult } from "./doc-service.js";

// Mock the analyzeDiff function
vi.mock("./diff-analyzer.js", () => ({
  analyzeDiff: vi.fn().mockResolvedValue({
    changes: [
      { file: "src/index.ts", type: "modified", additions: 10, deletions: 5 },
    ],
    searchQueries: ["index", "export"],
  }),
}));

// Mock indexFiles to avoid actual indexing
vi.mock("../indexer/indexer.js", () => ({
  indexFiles: vi.fn().mockResolvedValue({
    itemsIndexed: 10,
    errors: [],
  }),
}));

// Mock glob
vi.mock("node:fs/promises", () => ({
  glob: vi.fn().mockImplementation(async function* (pattern: string) {
    if (pattern.includes("docs")) {
      yield "docs/guide.md";
      yield "docs/api.md";
    }
    if (pattern.includes("README")) {
      yield "README.md";
    }
  }),
}));

describe("doc-service", () => {
  let mockDb: DatabaseService;

  beforeEach(() => {
    // Create a mock database service
    mockDb = {
      initialize: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      countItems: vi.fn().mockResolvedValue(0),
      search: vi.fn().mockResolvedValue([]),
      hybridSearch: vi.fn().mockResolvedValue([]),
      insertItems: vi.fn().mockResolvedValue(undefined),
      deleteBySource: vi.fn().mockResolvedValue(undefined),
      listSources: vi.fn().mockResolvedValue([]),
      listItems: vi.fn().mockResolvedValue([]), // Added missing method
      getAdapter: vi.fn(),
    } as unknown as DatabaseService;

    // Clear environment variables
    delete process.env.GITHUB_REPOSITORY;
    delete process.env.GITHUB_SHA;
    delete process.env.GITHUB_REF_NAME;
    delete process.env.GITHUB_HEAD_REF;
  });

  describe("analyzeDocuments", () => {
    it("should extract line numbers from boundary metadata", async () => {
      // Mock search results with boundary metadata containing line numbers
      const searchResults: VectorSearchResult[] = [
        {
          id: "1",
          content: "Documentation content",
          score: 0.9,
          metadata: {
            filePath: "docs/guide.md",
            boundary: {
              startLine: 15,
              endLine: 45,
              type: "heading",
              level: 2,
            },
          },
        },
      ];

      vi.mocked(mockDb.hybridSearch).mockResolvedValue(searchResults);

      const results = await analyzeDocuments(
        "HEAD~1",
        { documentPaths: ["docs/**/*.md"], threshold: 0.7 },
        mockDb,
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        file: "docs/guide.md",
        similarity: 0.9,
        startLine: 15,
        endLine: 45,
      });
    });

    it("should extract line numbers directly from metadata if not in boundary", async () => {
      // Mock search results with line numbers directly in metadata
      const searchResults: VectorSearchResult[] = [
        {
          id: "2",
          content: "README content",
          score: 0.85,
          metadata: {
            filePath: "README.md",
            startLine: 100,
            endLine: 150,
          },
        },
      ];

      vi.mocked(mockDb.hybridSearch).mockResolvedValue(searchResults);

      const results = await analyzeDocuments(
        "HEAD~1",
        { documentPaths: ["*.md"], threshold: 0.7 },
        mockDb,
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        file: "README.md",
        similarity: 0.85,
        startLine: 100,
        endLine: 150,
      });
    });

    it("should generate GitHub URL with line numbers when environment variables are set", async () => {
      // Set GitHub environment variables
      process.env.GITHUB_REPOSITORY = "owner/repo";
      process.env.GITHUB_SHA = "abc123";

      const searchResults: VectorSearchResult[] = [
        {
          id: "3",
          content: "API documentation",
          score: 0.95,
          metadata: {
            filePath: "docs/api.md",
            boundary: {
              startLine: 25,
              endLine: 75,
            },
          },
        },
      ];

      vi.mocked(mockDb.hybridSearch).mockResolvedValue(searchResults);

      const results = await analyzeDocuments(
        "HEAD~1",
        { documentPaths: ["docs/**/*.md"], threshold: 0.7 },
        mockDb,
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        file: "docs/api.md",
        githubUrl:
          "https://github.com/owner/repo/blob/abc123/docs/api.md#L25-L75",
      });
    });

    it("should generate GitHub URL with single line when only startLine exists", async () => {
      process.env.GITHUB_REPOSITORY = "owner/repo";
      process.env.GITHUB_SHA = "def456";

      const searchResults: VectorSearchResult[] = [
        {
          id: "4",
          content: "Single line reference",
          score: 0.8,
          metadata: {
            filePath: "README.md",
            startLine: 42,
          },
        },
      ];

      vi.mocked(mockDb.hybridSearch).mockResolvedValue(searchResults);

      const results = await analyzeDocuments(
        "HEAD~1",
        { documentPaths: ["*.md"], threshold: 0.7 },
        mockDb,
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        file: "README.md",
        startLine: 42,
        githubUrl: "https://github.com/owner/repo/blob/def456/README.md#L42",
      });
    });

    it("should handle results without line numbers", async () => {
      const searchResults: VectorSearchResult[] = [
        {
          id: "5",
          content: "Content without line numbers",
          score: 0.75,
          metadata: {
            filePath: "docs/guide.md",
          },
        },
      ];

      vi.mocked(mockDb.hybridSearch).mockResolvedValue(searchResults);

      const results = await analyzeDocuments(
        "HEAD~1",
        { documentPaths: ["docs/**/*.md"], threshold: 0.7 },
        mockDb,
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        file: "docs/guide.md",
        similarity: 0.75,
      });
      expect(results[0].startLine).toBeUndefined();
      expect(results[0].endLine).toBeUndefined();
      expect(results[0].githubUrl).toBeUndefined();
    });

    it("should deduplicate results for the same file", async () => {
      const searchResults: VectorSearchResult[] = [
        {
          id: "6",
          content: "First match",
          score: 0.9,
          metadata: {
            filePath: "docs/guide.md",
            boundary: { startLine: 10, endLine: 20 },
          },
        },
        {
          id: "7",
          content: "Second match (lower score)",
          score: 0.7,
          metadata: {
            filePath: "docs/guide.md",
            boundary: { startLine: 50, endLine: 60 },
          },
        },
      ];

      vi.mocked(mockDb.hybridSearch)
        .mockResolvedValueOnce(searchResults) // First query
        .mockResolvedValueOnce([]); // Second query

      const results = await analyzeDocuments(
        "HEAD~1",
        { documentPaths: ["docs/**/*.md"], threshold: 0.7 },
        mockDb,
      );

      // Should only keep the highest scoring result per file
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        file: "docs/guide.md",
        similarity: 0.9,
        startLine: 10,
        endLine: 20,
      });
    });

    it("should handle empty search results", async () => {
      vi.mocked(mockDb.hybridSearch).mockResolvedValue([]);

      const results = await analyzeDocuments(
        "HEAD~1",
        { documentPaths: ["docs/**/*.md"], threshold: 0.7 },
        mockDb,
      );

      expect(results).toEqual([]);
    });

    it("should filter results below threshold", async () => {
      const searchResults: VectorSearchResult[] = [
        {
          id: "8",
          content: "High relevance",
          score: 0.9,
          metadata: { filePath: "docs/high.md" },
        },
        {
          id: "9",
          content: "Low relevance",
          score: 0.3,
          metadata: { filePath: "docs/low.md" },
        },
      ];

      vi.mocked(mockDb.hybridSearch).mockResolvedValue(searchResults);

      const results = await analyzeDocuments(
        "HEAD~1",
        { documentPaths: ["docs/**/*.md"], threshold: 0.5 },
        mockDb,
      );

      expect(results).toHaveLength(1);
      expect(results[0].file).toBe("docs/high.md");
    });
  });
});

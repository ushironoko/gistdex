import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../../core/database/database-service.js";
import * as searchModule from "../../core/search/search.js";
import type { VectorSearchResult } from "../../core/vector-db/adapters/types.js";
import * as queryCacheModule from "../utils/query-cache.js";
import * as queryChainModule from "../utils/query-chain.js";
import * as structuredKnowledgeModule from "../utils/structured-knowledge.js";
import { handleQueryTool } from "./query-tool.js";

vi.mock("../../core/search/search.js");
vi.mock("../utils/query-cache.js");
vi.mock("../utils/query-chain.js");
vi.mock("../utils/structured-knowledge.js");

describe("query-tool", () => {
  let mockService: DatabaseService;
  const mockResults: VectorSearchResult[] = [
    {
      id: "1",
      content: "Test content 1",
      score: 0.9,
      metadata: { sourceId: "source1", sourceType: "text" },
    },
    {
      id: "2",
      content: "Test content 2",
      score: 0.8,
      metadata: { sourceId: "source2", sourceType: "text" },
    },
  ] as const satisfies VectorSearchResult[];

  beforeEach(() => {
    vi.clearAllMocks();
    mockService = {
      query: vi.fn(),
      index: vi.fn(),
      close: vi.fn(),
      listItems: vi.fn(),
    } as unknown as DatabaseService;

    // Setup default mocks
    vi.mocked(searchModule.semanticSearch).mockResolvedValue(mockResults);
    vi.mocked(searchModule.hybridSearch).mockResolvedValue(mockResults);
    vi.mocked(searchModule.rerankResults).mockReturnValue(mockResults);
    vi.mocked(searchModule.getSectionContent).mockResolvedValue(null);
    vi.mocked(searchModule.getOriginalContent).mockResolvedValue(null);
    vi.mocked(queryCacheModule.findSimilarQuery).mockReturnValue(null);
    vi.mocked(queryCacheModule.saveSuccessfulQuery).mockResolvedValue(
      undefined,
    );
  });

  describe("basic search", () => {
    it("should perform semantic search by default", async () => {
      const result = await handleQueryTool(
        { query: "test query" },
        { service: mockService },
      );

      expect(result.success).toBe(true);
      expect(searchModule.semanticSearch).toHaveBeenCalledWith(
        "test query",
        { k: 5, sourceType: undefined },
        mockService,
      );
    });

    it("should perform hybrid search when specified", async () => {
      const result = await handleQueryTool(
        { query: "test query", hybrid: true },
        { service: mockService },
      );

      expect(result.success).toBe(true);
      expect(searchModule.hybridSearch).toHaveBeenCalledWith(
        "test query",
        { k: 5, sourceType: undefined, keywordWeight: 0.3 },
        mockService,
      );
    });
  });

  describe("saveStructured option", () => {
    it("should save structured knowledge when option is enabled", async () => {
      const result = await handleQueryTool(
        { query: "test query", saveStructured: true },
        { service: mockService },
      );

      expect(result.success).toBe(true);
      expect(
        structuredKnowledgeModule.updateStructuredKnowledge,
      ).toHaveBeenCalledWith(
        "test query",
        expect.objectContaining({
          content: expect.stringContaining("Test content 1"),
          metadata: expect.objectContaining({
            searchStrategy: "semantic",
            resultCount: 2,
          }),
        }),
        expect.stringContaining("/queries"),
      );
    });

    it("should not save structured knowledge when option is disabled", async () => {
      const result = await handleQueryTool(
        { query: "test query", saveStructured: false },
        { service: mockService },
      );

      expect(result.success).toBe(true);
      expect(
        structuredKnowledgeModule.updateStructuredKnowledge,
      ).not.toHaveBeenCalled();
    });
  });

  describe("useChain option", () => {
    const mockChainResult = {
      topic: "test query",
      stages: [
        {
          stageNumber: 1,
          query: "test query",
          results: mockResults,
        },
      ],
      combinedResults: mockResults.map((r) => ({
        content: r.content,
        score: r.score,
        metadata: r.metadata,
      })),
      timestamp: new Date().toISOString(),
    };

    beforeEach(() => {
      vi.mocked(queryChainModule.executeQueryChain).mockResolvedValue(
        mockChainResult,
      );
    });

    it("should execute query chain when option is enabled", async () => {
      const result = await handleQueryTool(
        { query: "test query", useChain: true },
        { service: mockService },
      );

      expect(result.success).toBe(true);
      expect(queryChainModule.executeQueryChain).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: "test query",
          stages: expect.arrayContaining([
            expect.objectContaining({
              query: "test query",
              options: expect.objectContaining({
                hybrid: false,
                k: 5, // Updated from 3
              }),
            }),
            expect.objectContaining({
              query: expect.stringContaining("implementation"), // Updated query pattern
              options: expect.objectContaining({
                hybrid: true,
                k: 5, // Updated from 2
              }),
            }),
            expect.objectContaining({
              query: expect.stringContaining("related to"), // New stage 3
              options: expect.objectContaining({
                hybrid: true,
                k: 3,
              }),
            }),
          ]),
        }),
        mockService,
      );
    });

    it("should save structured knowledge from chain results when both options are enabled", async () => {
      // Mock buildStructuredResult
      const mockBuildStructuredResult = vi.fn().mockReturnValue({
        topic: "test query",
        content:
          "# Test Query\n\n## Query Chain Results\n\nTest structured content",
        metadata: {
          queryCount: 3,
          resultCount: 2,
          timestamp: expect.any(String),
          queries: [
            "test query",
            "test query implementation",
            'related to "test query"',
          ],
        },
      });

      // Mock the dynamic import
      vi.doMock("../utils/query-chain.js", () => ({
        buildStructuredResult: mockBuildStructuredResult,
      }));

      const result = await handleQueryTool(
        { query: "test query", useChain: true, saveStructured: true },
        { service: mockService },
      );

      expect(result.success).toBe(true);
      expect(
        structuredKnowledgeModule.updateStructuredKnowledge,
      ).toHaveBeenCalledWith(
        "test query",
        expect.objectContaining({
          content: expect.stringContaining("Query Chain Results"),
          metadata: expect.objectContaining({
            queryCount: 3,
            resultCount: 2,
            queryExecuted: "test query",
            isChainResult: true,
          }),
        }),
        expect.stringContaining("/queries"),
      );
    });

    it("should not execute regular search when using chain", async () => {
      const result = await handleQueryTool(
        { query: "test query", useChain: true },
        { service: mockService },
      );

      expect(result.success).toBe(true);
      expect(searchModule.semanticSearch).not.toHaveBeenCalled();
      expect(searchModule.hybridSearch).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should handle search errors gracefully", async () => {
      vi.mocked(searchModule.semanticSearch).mockRejectedValue(
        new Error("Search failed"),
      );

      const result = await handleQueryTool(
        { query: "test query" },
        { service: mockService },
      );

      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain("Search failed");
    });

    it("should handle chain execution errors", async () => {
      vi.mocked(queryChainModule.executeQueryChain).mockRejectedValue(
        new Error("Chain execution failed"),
      );

      const result = await handleQueryTool(
        { query: "test query", useChain: true },
        { service: mockService },
      );

      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain("Chain execution failed");
    });
  });

  describe("markdown file section auto-retrieval", () => {
    it("should automatically use section retrieval for markdown files", async () => {
      const markdownResults: VectorSearchResult[] = [
        {
          id: "md1",
          content: "## Section chunk",
          score: 0.9,
          metadata: {
            sourceId: "source1",
            sourceType: "file",
            filePath: "README.md",
            boundary: { type: "heading", level: 2, title: "Introduction" },
          },
        },
        {
          id: "md2",
          content: "Another section chunk",
          score: 0.85,
          metadata: {
            sourceId: "source2",
            sourceType: "file",
            filePath: "docs/guide.mdx",
            boundary: { type: "heading", level: 1, title: "Guide" },
          },
        },
      ];

      // Reset specific mocks for this test case
      vi.mocked(searchModule.semanticSearch).mockReset();
      vi.mocked(searchModule.getSectionContent).mockReset();
      vi.mocked(searchModule.rerankResults).mockReset();
      vi.mocked(queryCacheModule.saveSuccessfulQuery).mockReset();

      // Set up test-specific mock implementations
      vi.mocked(searchModule.semanticSearch).mockResolvedValue(markdownResults);
      vi.mocked(searchModule.getSectionContent).mockResolvedValue(
        "Full section content with multiple paragraphs",
      );
      vi.mocked(searchModule.rerankResults).mockReturnValue(markdownResults);
      vi.mocked(queryCacheModule.saveSuccessfulQuery).mockResolvedValue(
        undefined,
      );

      const result = await handleQueryTool(
        { query: "markdown test" },
        { service: mockService },
      );

      expect(result.success).toBe(true);
      // Should call getSectionContent for markdown files even without section flag
      expect(searchModule.getSectionContent).toHaveBeenCalledTimes(2);
      expect(searchModule.getSectionContent).toHaveBeenCalledWith(
        markdownResults[0],
        mockService,
      );
    });

    it("should not use section retrieval for non-markdown files", async () => {
      const nonMarkdownResults: VectorSearchResult[] = [
        {
          id: "js1",
          content: "JavaScript code",
          score: 0.9,
          metadata: {
            sourceId: "source1",
            sourceType: "file",
            filePath: "index.js",
            boundary: { type: "function", name: "main" },
          },
        },
      ];

      vi.mocked(searchModule.semanticSearch).mockResolvedValue(
        nonMarkdownResults,
      );

      const result = await handleQueryTool(
        { query: "js test" },
        { service: mockService },
      );

      expect(result.success).toBe(true);
      // Should not call getSectionContent for non-markdown files
      expect(searchModule.getSectionContent).not.toHaveBeenCalled();
    });

    it("should respect explicit section=false for markdown files", async () => {
      const markdownResults: VectorSearchResult[] = [
        {
          id: "md1",
          content: "Markdown content",
          score: 0.9,
          metadata: {
            sourceId: "source1",
            sourceType: "file",
            filePath: "README.md",
            boundary: { type: "heading", level: 1, title: "Title" },
          },
        },
      ];

      vi.mocked(searchModule.semanticSearch).mockResolvedValue(markdownResults);

      // Note: section=false is not actually possible with current schema (it's optional boolean)
      // This test documents the current behavior where undefined section allows auto-detection
      const result = await handleQueryTool(
        { query: "test", section: false },
        { service: mockService },
      );

      expect(result.success).toBe(true);
      // With explicit section=false, should not use section retrieval
      expect(searchModule.getSectionContent).not.toHaveBeenCalled();
    });

    it("should save cache with auto-applied section flag for markdown", async () => {
      const markdownResults: VectorSearchResult[] = [
        {
          id: "md1",
          content: "Markdown chunk",
          score: 0.9,
          metadata: {
            sourceId: "source1",
            sourceType: "file",
            filePath: "README.md",
            boundary: { type: "heading", level: 1, title: "Title" },
          },
        },
      ];

      // Reset specific mocks for this test case
      vi.mocked(searchModule.semanticSearch).mockReset();
      vi.mocked(searchModule.getSectionContent).mockReset();
      vi.mocked(searchModule.rerankResults).mockReset();
      vi.mocked(queryCacheModule.saveSuccessfulQuery).mockReset();

      // Set up test-specific mock implementations
      vi.mocked(searchModule.semanticSearch).mockResolvedValue(markdownResults);
      vi.mocked(searchModule.getSectionContent).mockResolvedValue(
        "Full markdown section content",
      );
      vi.mocked(searchModule.rerankResults).mockReturnValue(markdownResults);
      vi.mocked(queryCacheModule.saveSuccessfulQuery).mockResolvedValue(
        undefined,
      );

      await handleQueryTool(
        { query: "test markdown" },
        { service: mockService },
      );

      // Should save with useSection: true when markdown files are detected
      // The results should have been modified with section content
      expect(queryCacheModule.saveSuccessfulQuery).toHaveBeenCalledWith(
        "test markdown",
        expect.arrayContaining([
          expect.objectContaining({
            id: "md1",
            content: "Full markdown section content", // Content replaced with section content
            score: 0.9,
            metadata: expect.objectContaining({
              sourceId: "source1",
              sourceType: "file",
              filePath: "README.md",
            }),
          }),
        ]),
        expect.objectContaining({
          useSection: true,
        }),
      );
    });
  });

  describe("integration scenarios", () => {
    beforeEach(() => {
      const mockChainResult = {
        topic: "test query",
        stages: [
          {
            stageNumber: 1,
            query: "test query",
            results: mockResults,
          },
        ],
        combinedResults: mockResults.map((r) => ({
          content: r.content,
          score: r.score,
          metadata: r.metadata,
        })),
        timestamp: new Date().toISOString(),
      };
      vi.mocked(queryChainModule.executeQueryChain).mockResolvedValue(
        mockChainResult,
      );
    });

    it("should handle hybrid search with saveStructured", async () => {
      const result = await handleQueryTool(
        { query: "test query", hybrid: true, saveStructured: true, k: 10 },
        { service: mockService },
      );

      expect(result.success).toBe(true);
      expect(searchModule.hybridSearch).toHaveBeenCalledWith(
        "test query",
        { k: 10, sourceType: undefined, keywordWeight: 0.3 },
        mockService,
      );
      expect(
        structuredKnowledgeModule.updateStructuredKnowledge,
      ).toHaveBeenCalledWith(
        "test query",
        expect.objectContaining({
          metadata: expect.objectContaining({
            searchStrategy: "hybrid",
          }),
        }),
        expect.stringContaining("/queries"),
      );
    });

    it("should respect rerank option in query chain", async () => {
      const result = await handleQueryTool(
        { query: "test query", useChain: true, rerank: false },
        { service: mockService },
      );

      expect(result.success).toBe(true);
      expect(queryChainModule.executeQueryChain).toHaveBeenCalledWith(
        expect.objectContaining({
          stages: expect.arrayContaining([
            expect.objectContaining({
              options: expect.objectContaining({
                rerank: false,
              }),
            }),
          ]),
        }),
        mockService,
      );
    });
  });
});

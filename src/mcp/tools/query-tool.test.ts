import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
  type Mock,
  mock,
} from "bun:test";
import type { DatabaseService } from "../../core/database/database-service.js";
import * as searchModule from "../../core/search/search.js";
import type { VectorSearchResult } from "../../core/vector-db/adapters/types.js";
import * as queryCacheModule from "../utils/query-cache.js";
import * as queryChainModule from "../utils/query-chain.js";
import { handleQueryTool } from "./query-tool.js";

mock.module("../../core/search/search.js", () => ({
  semanticSearch: jest.fn(),
  hybridSearch: jest.fn(),
  rerankResults: jest.fn(),
  getSectionContent: jest.fn(),
  getOriginalContent: jest.fn(),
}));
mock.module("../utils/query-cache.js", () => ({
  findSimilarQuery: jest.fn(),
  saveSuccessfulQuery: jest.fn(),
}));
mock.module("../utils/query-chain.js", () => ({
  executeQueryChain: jest.fn(),
}));

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
    jest.clearAllMocks();
    mockService = {
      query: jest.fn(),
      index: jest.fn(),
      close: jest.fn(),
      listItems: jest.fn(),
    } as unknown as DatabaseService;

    // Setup default mocks
    (
      searchModule.semanticSearch as Mock<typeof searchModule.semanticSearch>
    ).mockResolvedValue(mockResults);
    (
      searchModule.hybridSearch as Mock<typeof searchModule.hybridSearch>
    ).mockResolvedValue(mockResults);
    (
      searchModule.rerankResults as Mock<typeof searchModule.rerankResults>
    ).mockReturnValue(mockResults);
    (
      searchModule.getSectionContent as Mock<
        typeof searchModule.getSectionContent
      >
    ).mockResolvedValue(null);
    (
      searchModule.getOriginalContent as Mock<
        typeof searchModule.getOriginalContent
      >
    ).mockResolvedValue(null);
    (
      queryCacheModule.findSimilarQuery as Mock<
        typeof queryCacheModule.findSimilarQuery
      >
    ).mockReturnValue(null);
    (
      queryCacheModule.saveSuccessfulQuery as Mock<
        typeof queryCacheModule.saveSuccessfulQuery
      >
    ).mockResolvedValue(undefined);
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
      (
        queryChainModule.executeQueryChain as Mock<
          typeof queryChainModule.executeQueryChain
        >
      ).mockResolvedValue(mockChainResult);
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
      (
        searchModule.semanticSearch as Mock<typeof searchModule.semanticSearch>
      ).mockRejectedValue(new Error("Search failed"));

      const result = await handleQueryTool(
        { query: "test query" },
        { service: mockService },
      );

      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain("Search failed");
    });

    it("should handle chain execution errors", async () => {
      (
        queryChainModule.executeQueryChain as Mock<
          typeof queryChainModule.executeQueryChain
        >
      ).mockRejectedValue(new Error("Chain execution failed"));

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
      (
        searchModule.semanticSearch as Mock<typeof searchModule.semanticSearch>
      ).mockReset();
      (
        searchModule.getSectionContent as Mock<
          typeof searchModule.getSectionContent
        >
      ).mockReset();
      (
        searchModule.rerankResults as Mock<typeof searchModule.rerankResults>
      ).mockReset();
      (
        queryCacheModule.saveSuccessfulQuery as Mock<
          typeof queryCacheModule.saveSuccessfulQuery
        >
      ).mockReset();

      // Set up test-specific mock implementations
      (
        searchModule.semanticSearch as Mock<typeof searchModule.semanticSearch>
      ).mockResolvedValue(markdownResults);
      (
        searchModule.getSectionContent as Mock<
          typeof searchModule.getSectionContent
        >
      ).mockResolvedValue("Full section content with multiple paragraphs");
      (
        searchModule.rerankResults as Mock<typeof searchModule.rerankResults>
      ).mockReturnValue(markdownResults);
      (
        queryCacheModule.saveSuccessfulQuery as Mock<
          typeof queryCacheModule.saveSuccessfulQuery
        >
      ).mockResolvedValue(undefined);

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

      (
        searchModule.semanticSearch as Mock<typeof searchModule.semanticSearch>
      ).mockResolvedValue(nonMarkdownResults);

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

      (
        searchModule.semanticSearch as Mock<typeof searchModule.semanticSearch>
      ).mockResolvedValue(markdownResults);

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
      (
        searchModule.semanticSearch as Mock<typeof searchModule.semanticSearch>
      ).mockReset();
      (
        searchModule.getSectionContent as Mock<
          typeof searchModule.getSectionContent
        >
      ).mockReset();
      (
        searchModule.rerankResults as Mock<typeof searchModule.rerankResults>
      ).mockReset();
      (
        queryCacheModule.saveSuccessfulQuery as Mock<
          typeof queryCacheModule.saveSuccessfulQuery
        >
      ).mockReset();

      // Set up test-specific mock implementations
      (
        searchModule.semanticSearch as Mock<typeof searchModule.semanticSearch>
      ).mockResolvedValue(markdownResults);
      (
        searchModule.getSectionContent as Mock<
          typeof searchModule.getSectionContent
        >
      ).mockResolvedValue("Full markdown section content");
      (
        searchModule.rerankResults as Mock<typeof searchModule.rerankResults>
      ).mockReturnValue(markdownResults);
      (
        queryCacheModule.saveSuccessfulQuery as Mock<
          typeof queryCacheModule.saveSuccessfulQuery
        >
      ).mockResolvedValue(undefined);

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
      (
        queryChainModule.executeQueryChain as Mock<
          typeof queryChainModule.executeQueryChain
        >
      ).mockResolvedValue(mockChainResult);
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

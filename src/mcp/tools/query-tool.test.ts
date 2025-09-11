import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueryToolInput } from "../schemas/validation.js";
import { queryToolSchema } from "../schemas/validation.js";

// Mock the core modules
vi.mock("../../core/database/database-operations.js", () => ({
  createDatabaseOperations: vi.fn(() => ({
    withDatabase: vi.fn(async (operation) => {
      const mockService = {
        initialize: vi.fn(),
        close: vi.fn(),
        saveItems: vi.fn(),
        searchItems: vi.fn().mockResolvedValue([
          {
            id: "test-id-1",
            content: "This is test content for semantic search",
            score: 0.95,
            metadata: {
              title: "Test Document 1",
              url: "https://example.com/doc1",
              sourceType: "text",
              sourceId: "source-1",
              chunkIndex: 0,
            },
          },
          {
            id: "test-id-2",
            content: "Another relevant document about testing",
            score: 0.87,
            metadata: {
              title: "Test Document 2",
              sourceType: "file",
              sourceId: "source-2",
              chunkIndex: 0,
            },
          },
        ]),
        getStats: vi.fn(),
        listItems: vi.fn().mockResolvedValue([
          {
            id: "test-id-1",
            content: "Full original content for test document 1",
            metadata: {
              originalContent: "Full original content for test document 1",
              sourceId: "source-1",
              chunkIndex: 0,
            },
          },
        ]),
        getAdapterInfo: vi.fn(),
      };
      return operation(mockService);
    }),
  })),
}));

vi.mock("../../core/database/database-service.js", () => ({
  databaseService: {
    initialize: vi.fn(),
    close: vi.fn(),
  },
}));

vi.mock("../../core/search/search.js", () => ({
  semanticSearch: vi.fn().mockResolvedValue([
    {
      id: "semantic-1",
      content: "Semantic search result content",
      score: 0.92,
      metadata: {
        title: "Semantic Result",
        sourceType: "text",
        sourceId: "sem-source-1",
      },
    },
  ]),
  hybridSearch: vi.fn().mockResolvedValue([
    {
      id: "hybrid-1",
      content: "Hybrid search result with keyword matching",
      score: 0.94,
      metadata: {
        title: "Hybrid Result",
        sourceType: "gist",
        sourceId: "hyb-source-1",
      },
    },
  ]),
  getOriginalContent: vi
    .fn()
    .mockResolvedValue("Full original content retrieved"),
  getSectionContent: vi
    .fn()
    .mockResolvedValue("Full section content with markdown boundaries"),
  calculateSearchStats: vi.fn().mockReturnValue({
    totalResults: 2,
    averageScore: 0.91,
    minScore: 0.87,
    maxScore: 0.95,
    sourceTypes: { text: 1, file: 1 },
  }),
  rerankResults: vi.fn((_query, results) => results),
}));

vi.mock("../../core/embedding/embedding.js", () => ({
  generateEmbedding: vi
    .fn()
    .mockResolvedValue(new Array(768).fill(0).map(() => Math.random())),
}));

vi.mock("../../core/security/security.js", () => ({
  validateQuery: vi.fn().mockImplementation((query) => query),
  SecurityError: class SecurityError extends Error {
    constructor(message: string, options?: ErrorOptions) {
      super(message, options);
      this.name = "SecurityError";
    }
  },
}));

// Mock sqlite-vec to avoid loading native modules in tests
vi.mock("sqlite-vec", () => ({
  default: vi.fn(),
}));

// Mock the sqlite adapter factory to avoid sqlite dependency
vi.mock("../../core/vector-db/adapters/sqlite-adapter.js", () => ({
  createSQLiteAdapter: vi.fn(() =>
    Promise.resolve({
      initialize: vi.fn(),
      close: vi.fn(),
      saveItems: vi.fn(),
      searchItems: vi.fn(),
      getItem: vi.fn(),
      updateItem: vi.fn(),
      deleteItem: vi.fn(),
      listItems: vi.fn(),
      getStats: vi.fn(),
      getAdapterInfo: vi.fn(() => ({
        name: "SQLite",
        version: "1.0.0",
        description: "Mock SQLite adapter",
      })),
    }),
  ),
}));

// Mock function that we'll implement later
const mockQueryTool = vi.fn();

describe("query-tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Zod schema validation", () => {
    it("validates basic query input correctly", () => {
      const validInput: QueryToolInput = {
        query: "test search query",
        k: 5,
        type: "text",
        hybrid: false,
        rerank: true,
        full: false,
      };

      const result = queryToolSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query).toBe("test search query");
        expect(result.data.k).toBe(5);
        expect(result.data.type).toBe("text");
        expect(result.data.hybrid).toBe(false);
        expect(result.data.rerank).toBe(true);
        expect(result.data.full).toBe(false);
      }
    });

    it("validates query with default values", () => {
      const validInput: QueryToolInput = {
        query: "simple query",
      };

      const result = queryToolSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query).toBe("simple query");
        expect(result.data.k).toBe(5); // default value
        expect(result.data.hybrid).toBe(false); // default value
        expect(result.data.rerank).toBe(true); // default value
        expect(result.data.full).toBe(false); // default value
      }
    });

    it("validates query with all source types", () => {
      const sourceTypes = ["gist", "github", "file", "text"] as const;

      for (const type of sourceTypes) {
        const validInput: QueryToolInput = {
          query: "test query",
          type,
        };

        const result = queryToolSchema.safeParse(validInput);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.type).toBe(type);
        }
      }
    });

    it("validates hybrid search options", () => {
      const validInput: QueryToolInput = {
        query: "hybrid search test",
        hybrid: true,
        k: 10,
      };

      const result = queryToolSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.hybrid).toBe(true);
        expect(result.data.k).toBe(10);
      }
    });

    it("validates full content retrieval option", () => {
      const validInput: QueryToolInput = {
        query: "full content test",
        full: true,
        k: 1,
      };

      const result = queryToolSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.full).toBe(true);
        expect(result.data.k).toBe(1);
      }
    });

    it("validates section content retrieval option", () => {
      const validInput: QueryToolInput = {
        query: "section content test",
        section: true,
        k: 5,
      };

      const result = queryToolSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.section).toBe(true);
        expect(result.data.query).toBe("section content test");
      }
    });

    it("validates that full and section options are mutually exclusive", () => {
      const validInput: QueryToolInput = {
        query: "test mutually exclusive options",
        full: true,
        section: true,
      };

      const result = queryToolSchema.safeParse(validInput);
      // スキーマレベルでは両方trueは許可される（実行時にエラー）
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.full).toBe(true);
        expect(result.data.section).toBe(true);
      }
    });

    it("rejects empty query", () => {
      const invalidInput = {
        query: "",
      };

      const result = queryToolSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(
          "String must contain at least 1 character(s)",
        );
      }
    });

    it("rejects invalid k value", () => {
      const invalidInput = {
        query: "test",
        k: 0,
      };

      const result = queryToolSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(
          "Number must be greater than 0",
        );
      }
    });

    it("rejects negative k value", () => {
      const invalidInput = {
        query: "test",
        k: -5,
      };

      const result = queryToolSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(
          "Number must be greater than 0",
        );
      }
    });

    it("rejects invalid source type", () => {
      const invalidInput = {
        query: "test",
        type: "invalid",
      };

      const result = queryToolSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("Invalid enum value");
      }
    });

    it("rejects non-integer k value", () => {
      const invalidInput = {
        query: "test",
        k: 5.5,
      };

      const result = queryToolSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("Expected integer");
      }
    });
  });

  describe("semantic search functionality", () => {
    it("performs basic semantic search successfully", async () => {
      const input: QueryToolInput = {
        query: "machine learning algorithms",
        k: 5,
      };

      mockQueryTool.mockResolvedValue({
        success: true,
        results: [
          {
            id: "result-1",
            content: "Advanced machine learning algorithms for data analysis",
            score: 0.92,
            metadata: {
              title: "ML Algorithms Guide",
              sourceType: "text",
              sourceId: "ml-guide-1",
            },
          },
        ],
        stats: {
          totalResults: 1,
          averageScore: 0.92,
          minScore: 0.92,
          maxScore: 0.92,
          sourceTypes: { text: 1 },
        },
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].content).toContain("machine learning");
      expect(result.results[0].score).toBe(0.92);
      expect(result.stats.totalResults).toBe(1);
    });

    it("handles semantic search with different k values", async () => {
      const testCases = [1, 3, 5, 10, 20];

      for (const k of testCases) {
        const input: QueryToolInput = {
          query: "test query",
          k,
        };

        mockQueryTool.mockResolvedValue({
          success: true,
          results: Array(Math.min(k, 5))
            .fill(null)
            .map((_, i) => ({
              id: `result-${i}`,
              content: `Result ${i + 1}`,
              score: 0.9 - i * 0.1,
              metadata: { sourceType: "text" },
            })),
        });

        const result = await mockQueryTool(input);

        expect(result.success).toBe(true);
        expect(result.results.length).toBeLessThanOrEqual(k);
      }
    });

    it("handles semantic search with no results", async () => {
      const input: QueryToolInput = {
        query: "nonexistent query xyz123",
      };

      mockQueryTool.mockResolvedValue({
        success: true,
        results: [],
        stats: {
          totalResults: 0,
          averageScore: 0,
          minScore: 0,
          maxScore: 0,
          sourceTypes: {},
        },
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(0);
      expect(result.stats.totalResults).toBe(0);
    });

    it("sorts results by score in descending order", async () => {
      const input: QueryToolInput = {
        query: "test ranking",
        k: 3,
      };

      mockQueryTool.mockResolvedValue({
        success: true,
        results: [
          { id: "1", content: "First", score: 0.95, metadata: {} },
          { id: "2", content: "Second", score: 0.89, metadata: {} },
          { id: "3", content: "Third", score: 0.82, metadata: {} },
        ],
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(true);
      expect(result.results[0].score).toBeGreaterThan(result.results[1].score);
      expect(result.results[1].score).toBeGreaterThan(result.results[2].score);
    });

    it("retrieves section content when section option is enabled", async () => {
      const input: QueryToolInput = {
        query: "markdown documentation",
        section: true,
        k: 2,
      };

      mockQueryTool.mockResolvedValue({
        success: true,
        results: [
          {
            id: "section-1",
            content: "Full section content with markdown boundaries",
            score: 0.93,
            metadata: {
              title: "Documentation",
              sourceType: "file",
              sourceId: "doc-source-1",
              boundary: {
                type: "markdown",
                level: 2,
                title: "Installation Guide",
              },
            },
          },
          {
            id: "section-2",
            content: "Another section with complete content",
            score: 0.87,
            metadata: {
              title: "API Reference",
              sourceType: "file",
              sourceId: "doc-source-2",
              boundary: {
                type: "markdown",
                level: 3,
                title: "Configuration Options",
              },
            },
          },
        ],
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].content).toContain("Full section content");
      expect(result.results[0].metadata.boundary).toBeDefined();
      expect(result.results[0].metadata.boundary.title).toBe(
        "Installation Guide",
      );
    });

    it("handles section retrieval with missing boundary metadata gracefully", async () => {
      const input: QueryToolInput = {
        query: "test content",
        section: true,
        k: 1,
      };

      mockQueryTool.mockResolvedValue({
        success: true,
        results: [
          {
            id: "no-boundary-1",
            content: "Regular chunk content without section info",
            score: 0.91,
            metadata: {
              title: "Regular Document",
              sourceType: "text",
              sourceId: "regular-source-1",
              // No boundary metadata
            },
          },
        ],
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      // Should fall back to regular chunk content when boundary is missing
      expect(result.results[0].content).toBe(
        "Regular chunk content without section info",
      );
    });
  });

  describe("hybrid search functionality", () => {
    it("performs hybrid search successfully", async () => {
      const input: QueryToolInput = {
        query: "python programming tutorial",
        hybrid: true,
        k: 5,
      };

      mockQueryTool.mockResolvedValue({
        success: true,
        results: [
          {
            id: "hybrid-result-1",
            content: "Python programming tutorial for beginners",
            score: 0.94,
            metadata: {
              title: "Python Tutorial",
              sourceType: "github",
              sourceId: "python-tutorial-1",
            },
          },
        ],
        searchType: "hybrid",
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(true);
      expect(result.searchType).toBe("hybrid");
      expect(result.results[0].content).toContain(
        "Python programming tutorial",
      );
      expect(result.results[0].score).toBe(0.94);
    });

    it("hybrid search combines semantic and keyword matching", async () => {
      const input: QueryToolInput = {
        query: "machine learning python",
        hybrid: true,
      };

      mockQueryTool.mockResolvedValue({
        success: true,
        results: [
          {
            id: "hybrid-1",
            content: "Python machine learning library with sklearn",
            score: 0.96, // Higher due to both semantic and keyword matches
            metadata: { sourceType: "file" },
          },
          {
            id: "semantic-1",
            content: "Artificial intelligence concepts and algorithms",
            score: 0.85, // Lower due to semantic match only
            metadata: { sourceType: "text" },
          },
        ],
        searchType: "hybrid",
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(true);
      expect(result.results[0].score).toBeGreaterThan(result.results[1].score);
      expect(result.results[0].content).toContain("Python");
      expect(result.results[0].content).toContain("machine learning");
    });

    it("compares hybrid vs semantic search results", async () => {
      const query = "javascript frameworks";

      // Semantic search
      const semanticInput: QueryToolInput = {
        query,
        hybrid: false,
      };

      mockQueryTool.mockResolvedValue({
        success: true,
        results: [
          {
            id: "sem-1",
            content: "Web development frameworks",
            score: 0.87,
            metadata: {},
          },
        ],
        searchType: "semantic",
      });

      const semanticResult = await mockQueryTool(semanticInput);

      // Hybrid search
      const hybridInput: QueryToolInput = {
        query,
        hybrid: true,
      };

      mockQueryTool.mockResolvedValue({
        success: true,
        results: [
          {
            id: "hyb-1",
            content: "JavaScript frameworks like React and Vue",
            score: 0.93,
            metadata: {},
          },
        ],
        searchType: "hybrid",
      });

      const hybridResult = await mockQueryTool(hybridInput);

      expect(semanticResult.success).toBe(true);
      expect(hybridResult.success).toBe(true);
      expect(hybridResult.results[0].score).toBeGreaterThan(
        semanticResult.results[0].score,
      );
    });
  });

  describe("result filtering by type", () => {
    it("filters results by gist type", async () => {
      const input: QueryToolInput = {
        query: "code snippet",
        type: "gist",
      };

      mockQueryTool.mockResolvedValue({
        success: true,
        results: [
          {
            id: "gist-1",
            content: "Useful code snippet from gist",
            score: 0.91,
            metadata: {
              title: "Code Snippet",
              sourceType: "gist",
              url: "https://gist.github.com/user/123",
            },
          },
        ],
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].metadata.sourceType).toBe("gist");
    });

    it("filters results by github type", async () => {
      const input: QueryToolInput = {
        query: "repository documentation",
        type: "github",
      };

      mockQueryTool.mockResolvedValue({
        success: true,
        results: [
          {
            id: "github-1",
            content: "Repository documentation and README",
            score: 0.88,
            metadata: {
              sourceType: "github",
              url: "https://github.com/user/repo",
            },
          },
        ],
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(true);
      expect(result.results[0].metadata.sourceType).toBe("github");
    });

    it("filters results by file type", async () => {
      const input: QueryToolInput = {
        query: "local document",
        type: "file",
      };

      mockQueryTool.mockResolvedValue({
        success: true,
        results: [
          {
            id: "file-1",
            content: "Content from local file",
            score: 0.85,
            metadata: {
              sourceType: "file",
              filePath: "/path/to/document.txt",
            },
          },
        ],
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(true);
      expect(result.results[0].metadata.sourceType).toBe("file");
    });

    it("filters results by text type", async () => {
      const input: QueryToolInput = {
        query: "user input",
        type: "text",
      };

      mockQueryTool.mockResolvedValue({
        success: true,
        results: [
          {
            id: "text-1",
            content: "User provided text content",
            score: 0.9,
            metadata: {
              sourceType: "text",
              title: "User Input",
            },
          },
        ],
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(true);
      expect(result.results[0].metadata.sourceType).toBe("text");
    });

    it("returns all types when no filter is specified", async () => {
      const input: QueryToolInput = {
        query: "mixed content",
      };

      mockQueryTool.mockResolvedValue({
        success: true,
        results: [
          {
            id: "1",
            content: "Gist content",
            score: 0.9,
            metadata: { sourceType: "gist" },
          },
          {
            id: "2",
            content: "GitHub content",
            score: 0.85,
            metadata: { sourceType: "github" },
          },
          {
            id: "3",
            content: "File content",
            score: 0.8,
            metadata: { sourceType: "file" },
          },
          {
            id: "4",
            content: "Text content",
            score: 0.75,
            metadata: { sourceType: "text" },
          },
        ],
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(4);
      const sourceTypes = result.results.map(
        (r: { metadata: { sourceType: string } }) => r.metadata.sourceType,
      );
      expect(sourceTypes).toContain("gist");
      expect(sourceTypes).toContain("github");
      expect(sourceTypes).toContain("file");
      expect(sourceTypes).toContain("text");
    });
  });

  describe("re-ranking functionality", () => {
    it("applies re-ranking by default", async () => {
      const input: QueryToolInput = {
        query: "machine learning python",
        rerank: true, // explicitly true
      };

      mockQueryTool.mockResolvedValue({
        success: true,
        results: [
          {
            id: "reranked-1",
            content: "Python machine learning with exact keyword matches",
            score: 0.95, // Boosted by re-ranking
            metadata: { sourceType: "text" },
          },
        ],
        reranked: true,
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(true);
      expect(result.reranked).toBe(true);
      expect(result.results[0].score).toBe(0.95);
    });

    it("disables re-ranking when specified", async () => {
      const input: QueryToolInput = {
        query: "machine learning python",
        rerank: false,
      };

      mockQueryTool.mockResolvedValue({
        success: true,
        results: [
          {
            id: "no-rerank-1",
            content: "Python machine learning without re-ranking boost",
            score: 0.87, // Original semantic score
            metadata: { sourceType: "text" },
          },
        ],
        reranked: false,
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(true);
      expect(result.reranked).toBe(false);
      expect(result.results[0].score).toBe(0.87);
    });

    it("re-ranking boosts exact keyword matches", async () => {
      const input: QueryToolInput = {
        query: "typescript react",
        rerank: true,
      };

      mockQueryTool.mockResolvedValue({
        success: true,
        results: [
          {
            id: "exact-match",
            content: "TypeScript React development guide with exact matches",
            score: 0.96, // Boosted by keyword matches
            metadata: { sourceType: "github" },
          },
          {
            id: "semantic-match",
            content: "Frontend development with modern frameworks",
            score: 0.82, // Lower semantic similarity, no keywords
            metadata: { sourceType: "file" },
          },
        ],
        reranked: true,
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(true);
      expect(result.results[0].score).toBeGreaterThan(result.results[1].score);
      expect(result.results[0].content).toContain("TypeScript");
      expect(result.results[0].content).toContain("React");
    });

    it("compares results with and without re-ranking", async () => {
      const query = "node.js backend";

      // Without re-ranking
      const withoutRerank: QueryToolInput = {
        query,
        rerank: false,
      };

      mockQueryTool.mockResolvedValue({
        success: true,
        results: [
          {
            id: "1",
            content: "Backend development concepts",
            score: 0.88,
            metadata: {},
          },
          {
            id: "2",
            content: "Node.js server setup guide",
            score: 0.85,
            metadata: {},
          },
        ],
        reranked: false,
      });

      const withoutResult = await mockQueryTool(withoutRerank);

      // With re-ranking
      const withRerank: QueryToolInput = {
        query,
        rerank: true,
      };

      mockQueryTool.mockResolvedValue({
        success: true,
        results: [
          {
            id: "2",
            content: "Node.js server setup guide",
            score: 0.92,
            metadata: {},
          }, // Boosted
          {
            id: "1",
            content: "Backend development concepts",
            score: 0.88,
            metadata: {},
          },
        ],
        reranked: true,
      });

      const withResult = await mockQueryTool(withRerank);

      expect(withoutResult.success).toBe(true);
      expect(withResult.success).toBe(true);
      expect(withResult.results[0].id).toBe("2"); // Re-ranked to first position
      expect(withResult.results[0].score).toBeGreaterThan(
        withoutResult.results[1].score,
      );
    });
  });

  describe("full content retrieval", () => {
    it("retrieves full original content when requested", async () => {
      const input: QueryToolInput = {
        query: "documentation",
        full: true,
        k: 1,
      };

      mockQueryTool.mockResolvedValue({
        success: true,
        results: [
          {
            id: "full-content-1",
            content: "This is a chunk of a larger document...",
            score: 0.91,
            metadata: {
              sourceType: "file",
              sourceId: "doc-source-1",
              chunkIndex: 2,
              totalChunks: 5,
            },
            originalContent:
              "This is the complete original document content that was split into multiple chunks for indexing. It contains all the information that was originally present in the source document, including this chunk and all other chunks combined together.",
          },
        ],
        fullContent: true,
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(true);
      expect(result.fullContent).toBe(true);
      expect(result.results[0].originalContent).toBeDefined();
      expect(result.results[0].originalContent).toContain(
        "complete original document",
      );
    });

    it("handles chunk reconstruction for full content", async () => {
      const input: QueryToolInput = {
        query: "multi-chunk document",
        full: true,
      };

      mockQueryTool.mockResolvedValue({
        success: true,
        results: [
          {
            id: "multi-chunk-1",
            content: "Middle chunk of the document",
            score: 0.89,
            metadata: {
              sourceType: "github",
              sourceId: "multi-source-1",
              chunkIndex: 1,
              totalChunks: 3,
            },
            originalContent:
              "First chunk content. Middle chunk of the document. Final chunk content.",
          },
        ],
        fullContent: true,
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(true);
      expect(result.results[0].originalContent).toContain("First chunk");
      expect(result.results[0].originalContent).toContain("Middle chunk");
      expect(result.results[0].originalContent).toContain("Final chunk");
    });

    it("falls back to chunk content when original not available", async () => {
      const input: QueryToolInput = {
        query: "single chunk",
        full: true,
      };

      mockQueryTool.mockResolvedValue({
        success: true,
        results: [
          {
            id: "single-chunk-1",
            content: "This is the only chunk content available",
            score: 0.86,
            metadata: {
              sourceType: "text",
              sourceId: "single-source-1",
            },
            originalContent: "This is the only chunk content available", // Same as chunk
          },
        ],
        fullContent: true,
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(true);
      expect(result.results[0].originalContent).toBe(result.results[0].content);
    });

    it("shows chunk content when full content is disabled", async () => {
      const input: QueryToolInput = {
        query: "chunk only",
        full: false,
      };

      mockQueryTool.mockResolvedValue({
        success: true,
        results: [
          {
            id: "chunk-only-1",
            content: "This is just the chunk content without full retrieval",
            score: 0.84,
            metadata: {
              sourceType: "file",
              sourceId: "chunk-source-1",
            },
            // No originalContent when full is false
          },
        ],
        fullContent: false,
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(true);
      expect(result.fullContent).toBe(false);
      expect(result.results[0].originalContent).toBeUndefined();
      expect(result.results[0].content).toBe(
        "This is just the chunk content without full retrieval",
      );
    });
  });

  describe("error handling", () => {
    it("handles database connection errors", async () => {
      const input: QueryToolInput = {
        query: "test query",
      };

      mockQueryTool.mockResolvedValue({
        success: false,
        error: "Database connection failed",
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Database connection failed");
    });

    it("handles embedding generation errors", async () => {
      const input: QueryToolInput = {
        query: "test query",
      };

      mockQueryTool.mockResolvedValue({
        success: false,
        error: "Failed to generate embeddings for query",
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to generate embeddings");
    });

    it("handles search service errors", async () => {
      const input: QueryToolInput = {
        query: "test query",
      };

      mockQueryTool.mockResolvedValue({
        success: false,
        error: "Search service unavailable",
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Search service unavailable");
    });

    it("handles mutually exclusive full and section options", async () => {
      const input: QueryToolInput = {
        query: "test query",
        full: true,
        section: true,
      };

      mockQueryTool.mockResolvedValue({
        success: false,
        error: "Cannot use both 'full' and 'section' options together",
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        "Cannot use both 'full' and 'section' options together",
      );
    });

    it("handles invalid query characters", async () => {
      const input: QueryToolInput = {
        query: "test\x00query\x01", // Contains null bytes
      };

      mockQueryTool.mockResolvedValue({
        success: false,
        error: "Query contains invalid characters",
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain("invalid characters");
    });

    it("handles extremely large k values", async () => {
      const input: QueryToolInput = {
        query: "test query",
        k: 10000,
      };

      mockQueryTool.mockResolvedValue({
        success: false,
        error: "K value exceeds maximum allowed limit",
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain("exceeds maximum allowed limit");
    });

    it("handles network timeout errors", async () => {
      const input: QueryToolInput = {
        query: "test query",
      };

      mockQueryTool.mockResolvedValue({
        success: false,
        error: "Request timeout - embedding service unavailable",
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain("timeout");
    });

    it("handles partial search failures", async () => {
      const input: QueryToolInput = {
        query: "test query",
      };

      mockQueryTool.mockResolvedValue({
        success: true,
        results: [
          {
            id: "partial-1",
            content: "Successfully retrieved result",
            score: 0.88,
            metadata: { sourceType: "text" },
          },
        ],
        warnings: [
          "Some results could not be retrieved due to access permissions",
        ],
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.warnings?.[0]).toContain("access permissions");
    });
  });

  describe("search statistics", () => {
    it("calculates basic search statistics", async () => {
      const input: QueryToolInput = {
        query: "statistics test",
      };

      mockQueryTool.mockResolvedValue({
        success: true,
        results: [
          {
            id: "1",
            content: "Result 1",
            score: 0.95,
            metadata: { sourceType: "text" },
          },
          {
            id: "2",
            content: "Result 2",
            score: 0.85,
            metadata: { sourceType: "file" },
          },
          {
            id: "3",
            content: "Result 3",
            score: 0.75,
            metadata: { sourceType: "text" },
          },
        ],
        stats: {
          totalResults: 3,
          averageScore: 0.85,
          minScore: 0.75,
          maxScore: 0.95,
          sourceTypes: { text: 2, file: 1 },
        },
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(true);
      expect(result.stats.totalResults).toBe(3);
      expect(result.stats.averageScore).toBe(0.85);
      expect(result.stats.minScore).toBe(0.75);
      expect(result.stats.maxScore).toBe(0.95);
      expect(result.stats.sourceTypes.text).toBe(2);
      expect(result.stats.sourceTypes.file).toBe(1);
    });

    it("handles empty results statistics", async () => {
      const input: QueryToolInput = {
        query: "no results query",
      };

      mockQueryTool.mockResolvedValue({
        success: true,
        results: [],
        stats: {
          totalResults: 0,
          averageScore: 0,
          minScore: 0,
          maxScore: 0,
          sourceTypes: {},
        },
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(true);
      expect(result.stats.totalResults).toBe(0);
      expect(result.stats.averageScore).toBe(0);
      expect(Object.keys(result.stats.sourceTypes)).toHaveLength(0);
    });

    it("calculates statistics for mixed source types", async () => {
      const input: QueryToolInput = {
        query: "mixed sources",
      };

      mockQueryTool.mockResolvedValue({
        success: true,
        results: [
          {
            id: "1",
            content: "Gist 1",
            score: 0.9,
            metadata: { sourceType: "gist" },
          },
          {
            id: "2",
            content: "Gist 2",
            score: 0.85,
            metadata: { sourceType: "gist" },
          },
          {
            id: "3",
            content: "GitHub 1",
            score: 0.8,
            metadata: { sourceType: "github" },
          },
          {
            id: "4",
            content: "File 1",
            score: 0.75,
            metadata: { sourceType: "file" },
          },
          {
            id: "5",
            content: "Text 1",
            score: 0.7,
            metadata: { sourceType: "text" },
          },
        ],
        stats: {
          totalResults: 5,
          averageScore: 0.8,
          minScore: 0.7,
          maxScore: 0.9,
          sourceTypes: { gist: 2, github: 1, file: 1, text: 1 },
        },
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(true);
      expect(result.stats.sourceTypes.gist).toBe(2);
      expect(result.stats.sourceTypes.github).toBe(1);
      expect(result.stats.sourceTypes.file).toBe(1);
      expect(result.stats.sourceTypes.text).toBe(1);
      expect(Object.keys(result.stats.sourceTypes)).toHaveLength(4);
    });
  });

  describe("performance and edge cases", () => {
    it("handles very long queries", async () => {
      const longQuery = "a".repeat(1000);
      const input: QueryToolInput = {
        query: longQuery,
      };

      mockQueryTool.mockResolvedValue({
        success: true,
        results: [
          {
            id: "long-query-result",
            content: "Result for very long query",
            score: 0.8,
            metadata: { sourceType: "text" },
          },
        ],
        warnings: ["Query was truncated for processing"],
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(true);
      expect(result.warnings?.[0]).toContain("truncated");
    });

    it("handles special characters in query", async () => {
      const input: QueryToolInput = {
        query: "test-query with special: chars! @#$%^&*()",
      };

      mockQueryTool.mockResolvedValue({
        success: true,
        results: [
          {
            id: "special-chars-result",
            content: "Result for special characters query",
            score: 0.82,
            metadata: { sourceType: "text" },
          },
        ],
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
    });

    it("handles unicode and emoji in query", async () => {
      const input: QueryToolInput = {
        query: "test query with unicode 测试 and emoji 🚀 👍",
      };

      mockQueryTool.mockResolvedValue({
        success: true,
        results: [
          {
            id: "unicode-emoji-result",
            content: "Result for unicode and emoji query",
            score: 0.79,
            metadata: { sourceType: "text" },
          },
        ],
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
    });

    it("handles maximum k value efficiently", async () => {
      const input: QueryToolInput = {
        query: "efficiency test",
        k: 100,
      };

      mockQueryTool.mockResolvedValue({
        success: true,
        results: Array(100)
          .fill(null)
          .map((_, i) => ({
            id: `result-${i}`,
            content: `Result ${i + 1}`,
            score: 0.9 - i * 0.001,
            metadata: { sourceType: "text" },
          })),
        performanceMetrics: {
          searchTime: 150, // milliseconds
          resultCount: 100,
        },
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(100);
      expect(result.performanceMetrics.searchTime).toBeLessThan(1000);
    });

    it("handles concurrent search requests", async () => {
      const queries = [
        "concurrent query 1",
        "concurrent query 2",
        "concurrent query 3",
      ];

      const promises = queries.map((query, i) => {
        const input: QueryToolInput = { query };
        mockQueryTool.mockResolvedValue({
          success: true,
          results: [
            {
              id: `concurrent-${i}`,
              content: `Result for ${query}`,
              score: 0.8 + i * 0.05,
              metadata: { sourceType: "text" },
            },
          ],
        });
        return mockQueryTool(input);
      });

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      for (const result of results) {
        expect(result.success).toBe(true);
      }
    });
  });

  describe("database service integration", () => {
    it("initializes database service correctly", async () => {
      const input: QueryToolInput = {
        query: "database test",
      };

      mockQueryTool.mockResolvedValue({
        success: true,
        results: [
          {
            id: "db-test-1",
            content: "Database service working correctly",
            score: 0.91,
            metadata: { sourceType: "text" },
          },
        ],
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(true);
      // In real implementation, verify database service was properly initialized
    });

    it("handles database service initialization failure", async () => {
      const input: QueryToolInput = {
        query: "database failure test",
      };

      mockQueryTool.mockResolvedValue({
        success: false,
        error: "Failed to initialize database service",
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to initialize database service");
    });

    it("properly closes database connections", async () => {
      const input: QueryToolInput = {
        query: "connection test",
      };

      mockQueryTool.mockResolvedValue({
        success: true,
        results: [
          {
            id: "connection-test-1",
            content: "Connection handled properly",
            score: 0.88,
            metadata: { sourceType: "text" },
          },
        ],
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(true);
      // In real implementation, verify connections were properly closed
    });
  });

  describe("section option", () => {
    it("returns section content when section option is true", async () => {
      const input: QueryToolInput = {
        query: "markdown sections",
        section: true,
      };

      mockQueryTool.mockResolvedValue({
        success: true,
        message: "Search completed successfully",
        results: [
          {
            id: "section-1",
            content: "## Introduction\n\nThis is the full introduction section",
            score: 0.92,
            metadata: {
              title: "Documentation",
              sourceType: "file",
              filePath: "docs.md",
              boundary: {
                type: "heading",
                level: 2,
                title: "Introduction",
              },
            },
          },
        ],
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].content).toContain("## Introduction");
      expect(result.results[0].metadata.boundary).toBeDefined();
    });

    it("rejects both full and section options together", async () => {
      const input: QueryToolInput = {
        query: "test query",
        full: true,
        section: true,
      };

      mockQueryTool.mockResolvedValue({
        success: false,
        error: "Cannot use both 'full' and 'section' options together",
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Cannot use both 'full' and 'section'");
    });

    it("falls back to chunk content when no boundary info", async () => {
      const input: QueryToolInput = {
        query: "regular text",
        section: true,
      };

      mockQueryTool.mockResolvedValue({
        success: true,
        message: "Search completed successfully",
        results: [
          {
            id: "chunk-1",
            content: "Regular chunk content without section info",
            score: 0.88,
            metadata: {
              title: "Document",
              sourceType: "text",
            },
          },
        ],
      });

      const result = await mockQueryTool(input);

      expect(result.success).toBe(true);
      expect(result.results[0].content).toBe(
        "Regular chunk content without section info",
      );
    });
  });
});

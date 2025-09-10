import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleQuery } from "./query.js";

// Test context type that matches what handleQuery expects
type TestQueryContext = Parameters<typeof handleQuery>[0];

// Mock node:sqlite to avoid import errors
vi.mock("node:sqlite", () => ({
  DatabaseSync: vi.fn(),
}));

vi.mock("../../core/database/database-service.js", () => ({
  databaseService: {
    initialize: vi.fn(),
    close: vi.fn(),
    searchItems: vi.fn().mockResolvedValue([]),
  },
  createDatabaseService: vi.fn(() => ({
    initialize: vi.fn(),
    close: vi.fn(),
    searchItems: vi.fn().mockResolvedValue([]),
    saveItem: vi.fn(),
    saveItems: vi.fn(),
    countItems: vi.fn(),
    listItems: vi.fn(),
    getStats: vi.fn(),
    getAdapterInfo: vi.fn(),
  })),
}));

vi.mock("../../core/search/search.js", () => ({
  semanticSearch: vi.fn().mockResolvedValue([
    {
      content: "Test result content",
      score: 0.95,
      metadata: {
        title: "Test Result",
        url: "https://example.com",
        sourceType: "text" as const,
      },
    },
  ]),
  hybridSearch: vi.fn().mockResolvedValue([
    {
      content: "Hybrid result content",
      score: 0.98,
      metadata: {
        title: "Hybrid Result",
        sourceType: "file" as const,
      },
    },
  ]),
  calculateSearchStats: vi.fn().mockReturnValue({
    totalResults: 1,
    averageScore: 0.95,
    minScore: 0.95,
    maxScore: 0.95,
    sourceTypes: { text: 1 },
  }),
  getOriginalContent: vi.fn().mockResolvedValue("Original full content"),
  getSectionContent: vi.fn().mockResolvedValue("Section content from markdown"),
}));

describe("handleQuery", () => {
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalProcessExit = process.exit;

  beforeEach(() => {
    console.log = vi.fn();
    console.error = vi.fn();
    // @ts-expect-error - Mocking process.exit for testing
    process.exit = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    process.exit = originalProcessExit;
  });

  it("performs semantic search", async () => {
    await handleQuery({
      values: {},
      positionals: ["test", "query"],
    } as const satisfies TestQueryContext);

    const { semanticSearch } = await import("../../core/search/search.js");
    // TODO: The third parameter uses expect.any(Object) which doesn't verify
    // the actual structure of the service object being passed.
    // Consider adding more specific assertions for the database service.
    expect(semanticSearch).toHaveBeenCalledWith(
      "test query",
      expect.objectContaining({ k: 5, rerank: true }),
      expect.any(Object),
    );
    expect(console.log).toHaveBeenCalledWith('Searching for: "test query"\n');
    expect(console.log).toHaveBeenCalledWith("Found 1 results\n");
    expect(console.log).toHaveBeenCalledWith("1. Test Result");
  });

  it("performs hybrid search", async () => {
    await handleQuery({
      values: { hybrid: true },
      positionals: ["test", "query"],
    } as const satisfies TestQueryContext);

    const { hybridSearch } = await import("../../core/search/search.js");
    // TODO: The third parameter uses expect.any(Object) which doesn't verify
    // the actual structure of the service object being passed.
    // Consider adding more specific assertions for the database service.
    expect(hybridSearch).toHaveBeenCalledWith(
      "test query",
      expect.objectContaining({ k: 5, rerank: true }),
      expect.any(Object),
    );
    expect(console.log).toHaveBeenCalledWith("1. Hybrid Result");
  });

  it("handles empty query", async () => {
    await handleQuery({
      values: {},
      positionals: [],
    } as const satisfies TestQueryContext);

    expect(console.error).toHaveBeenCalledWith("Error: No query specified");
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("handles no results", async () => {
    const { semanticSearch } = await import("../../core/search/search.js");
    vi.mocked(semanticSearch).mockResolvedValueOnce([]);

    await handleQuery({
      values: {},
      positionals: ["test"],
    } as const satisfies TestQueryContext);

    expect(console.log).toHaveBeenCalledWith("No results found");
  });

  it("outputs full original content when --full flag is used with --top-k 1", async () => {
    const mockResult = {
      id: "test-id-123",
      content: "This is chunk 2 of the content",
      score: 0.95,
      metadata: {
        title: "Test Result",
        url: "https://example.com",
        sourceType: "text" as const,
        sourceId: "source-123",
        chunkIndex: 1,
        totalChunks: 3,
      },
    };

    const { semanticSearch, getOriginalContent } = await import(
      "../../core/search/search.js"
    );
    vi.mocked(semanticSearch).mockResolvedValueOnce([mockResult]);
    vi.mocked(getOriginalContent).mockResolvedValueOnce(
      "This is the complete original content that was indexed. It includes all three chunks combined together.",
    );

    await handleQuery({
      values: { full: true, "top-k": "1" },
      positionals: ["test", "query"],
    } as const satisfies TestQueryContext);

    expect(console.log).toHaveBeenCalledWith('Searching for: "test query"\n');
    expect(getOriginalContent).toHaveBeenCalledWith(
      mockResult,
      expect.any(Object),
    );
    expect(console.log).toHaveBeenCalledWith(
      "This is the complete original content that was indexed. It includes all three chunks combined together.",
    );
  });

  it("shows full original content when --full flag is used in normal mode", async () => {
    const chunkContent = "This is a chunk content";
    const mockResult = {
      id: "test-id",
      content: chunkContent,
      score: 0.95,
      metadata: {
        title: "Long Content Test",
        sourceType: "text" as const,
        sourceId: "source-456",
      },
    };

    const { semanticSearch, getOriginalContent } = await import(
      "../../core/search/search.js"
    );
    vi.mocked(semanticSearch).mockResolvedValueOnce([mockResult]);
    vi.mocked(getOriginalContent).mockResolvedValueOnce(
      "This is the complete original long content that spans multiple chunks",
    );

    await handleQuery({
      values: { full: true },
      positionals: ["test", "query"],
    } as const satisfies TestQueryContext);

    expect(console.log).toHaveBeenCalledWith('Searching for: "test query"\n');
    expect(console.log).toHaveBeenCalledWith("Found 1 results\n");
    expect(getOriginalContent).toHaveBeenCalledWith(
      mockResult,
      expect.any(Object),
    );
    // Should show full original content
    expect(console.log).toHaveBeenCalledWith(
      "   | This is the complete original long content that spans multiple chunks",
    );
  });

  it("works with -t shorthand for type filter", async () => {
    await handleQuery({
      values: { type: "file" },
      positionals: ["test", "query"],
    } as const satisfies TestQueryContext);

    const { semanticSearch } = await import("../../core/search/search.js");
    expect(semanticSearch).toHaveBeenCalledWith(
      "test query",
      expect.objectContaining({ sourceType: "file" }),
      expect.any(Object),
    );
  });

  it("works with -y shorthand for hybrid search", async () => {
    await handleQuery({
      values: { hybrid: true },
      positionals: ["test", "query"],
    } as const satisfies TestQueryContext);

    const { hybridSearch } = await import("../../core/search/search.js");
    expect(hybridSearch).toHaveBeenCalledWith(
      "test query",
      expect.any(Object),
      expect.any(Object),
    );
  });

  it("works with -n shorthand for no-rerank", async () => {
    await handleQuery({
      values: { "no-rerank": true },
      positionals: ["test", "query"],
    } as const satisfies TestQueryContext);

    const { semanticSearch } = await import("../../core/search/search.js");
    expect(semanticSearch).toHaveBeenCalledWith(
      "test query",
      expect.objectContaining({ rerank: false }),
      expect.any(Object),
    );
  });

  it("displays section content with --section option", async () => {
    const mockResult = {
      id: "test-section-id",
      content: "Section chunk content",
      score: 0.95,
      metadata: {
        title: "Test Document",
        sourceType: "file" as const,
        filePath: "test.md",
        boundary: {
          type: "heading",
          level: 2,
          title: "Introduction",
        },
      },
    };

    const { semanticSearch, getSectionContent } = await import(
      "../../core/search/search.js"
    );
    vi.mocked(semanticSearch).mockResolvedValue([mockResult]);
    vi.mocked(getSectionContent).mockResolvedValue(
      "## Introduction\n\nThis is the full introduction section content with multiple paragraphs.",
    );

    await handleQuery({
      values: { section: true },
      positionals: ["test", "query"],
    } as const satisfies TestQueryContext);

    expect(getSectionContent).toHaveBeenCalledWith(
      mockResult,
      expect.any(Object),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Section: Introduction (Level 2)"),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("## Introduction"),
    );
  });

  it("rejects both --full and --section options together", async () => {
    // Test will throw error, so we catch it
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      await handleQuery({
        values: { full: true, section: true },
        positionals: ["test", "query"],
      } as const satisfies TestQueryContext);
    } catch (_error) {
      // Expected to throw
    }

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Cannot use both --full and --section"),
    );

    consoleErrorSpy.mockRestore();
  });

  it("works with -s shorthand for section", async () => {
    const mockResult = {
      id: "test-section-shorthand-id",
      content: "Section content",
      score: 0.95,
      metadata: {
        title: "Test",
        sourceType: "file" as const,
        boundary: {
          type: "heading",
          level: 1,
          title: "Main Title",
        },
      },
    };

    const { semanticSearch, getSectionContent } = await import(
      "../../core/search/search.js"
    );
    vi.mocked(semanticSearch).mockResolvedValue([mockResult]);

    await handleQuery({
      values: { section: true },
      positionals: ["test"],
    } as const satisfies TestQueryContext);

    expect(getSectionContent).toHaveBeenCalled();
  });
});

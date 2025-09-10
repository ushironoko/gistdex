import { beforeEach, describe, expect, test, vi } from "vitest";
import type { DatabaseService } from "../database/database-service.js";
import type { VectorSearchResult } from "../vector-db/adapters/types.js";
import { getSectionContent } from "./search.js";

describe("getSectionContent", () => {
  let mockService: DatabaseService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockService = {
      initialize: vi.fn(),
      saveItem: vi.fn(),
      saveItems: vi.fn(),
      searchItems: vi.fn(),
      countItems: vi.fn(),
      listItems: vi.fn(),
      getStats: vi.fn(),
      close: vi.fn(),
      getAdapterInfo: vi.fn(),
    } as unknown as DatabaseService;
  });

  test("returns section content when boundary information is available", async () => {
    const result: VectorSearchResult = {
      id: "1",
      content: "## Introduction\n\nThis is the intro.",
      score: 0.95,
      metadata: {
        sourceId: "source-123",
        boundary: {
          type: "heading",
          level: 2,
          title: "Introduction",
        },
      },
    };

    const sectionChunks = [
      {
        id: "1",
        content: "## Introduction\n\nThis is the intro.",
        embedding: [],
        metadata: {
          sourceId: "source-123",
          chunkIndex: 0,
          boundary: {
            type: "heading",
            level: 2,
            title: "Introduction",
          },
        },
      },
      {
        id: "2",
        content: "More content in the introduction section.",
        embedding: [],
        metadata: {
          sourceId: "source-123",
          chunkIndex: 1,
          boundary: {
            type: "heading",
            level: 2,
            title: "Introduction",
          },
        },
      },
    ];

    vi.mocked(mockService.listItems).mockResolvedValue(sectionChunks);

    const content = await getSectionContent(result, mockService);

    expect(mockService.listItems).toHaveBeenCalledWith({
      limit: 1000,
      filter: {
        sourceId: "source-123",
        "boundary.type": "heading",
        "boundary.title": "Introduction",
        "boundary.level": 2,
      },
    });

    expect(content).toContain("## Introduction");
    expect(content).toContain("This is the intro");
    expect(content).toContain("More content in the introduction section");
  });

  test("returns original chunk content when no boundary information", async () => {
    const result: VectorSearchResult = {
      id: "1",
      content: "Regular content without section info",
      score: 0.95,
      metadata: {
        sourceId: "source-123",
      },
    };

    const content = await getSectionContent(result, mockService);

    expect(mockService.listItems).not.toHaveBeenCalled();
    expect(content).toBe("Regular content without section info");
  });

  test("returns original chunk content when no sourceId", async () => {
    const result: VectorSearchResult = {
      id: "1",
      content: "Content without sourceId",
      score: 0.95,
      metadata: {
        boundary: {
          type: "heading",
          level: 1,
          title: "Title",
        },
      },
    };

    const content = await getSectionContent(result, mockService);

    expect(mockService.listItems).not.toHaveBeenCalled();
    expect(content).toBe("Content without sourceId");
  });

  test("handles empty search results gracefully", async () => {
    const result: VectorSearchResult = {
      id: "1",
      content: "Original chunk content",
      score: 0.95,
      metadata: {
        sourceId: "source-123",
        boundary: {
          type: "heading",
          level: 2,
          title: "Missing Section",
        },
      },
    };

    vi.mocked(mockService.listItems).mockResolvedValue([]);

    const content = await getSectionContent(result, mockService);

    expect(content).toBe("Original chunk content");
  });

  test("reconstructs content with overlap removal", async () => {
    const result: VectorSearchResult = {
      id: "1",
      content: "First chunk",
      score: 0.95,
      metadata: {
        sourceId: "source-123",
        boundary: {
          type: "heading",
          level: 2,
          title: "Section",
        },
      },
    };

    const sectionChunks = [
      {
        id: "1",
        content: "First chunk with some overlapping text",
        embedding: [],
        metadata: {
          sourceId: "source-123",
          chunkIndex: 0,
          boundary: { type: "heading", level: 2, title: "Section" },
        },
      },
      {
        id: "2",
        content: "overlapping text and new content",
        embedding: [],
        metadata: {
          sourceId: "source-123",
          chunkIndex: 1,
          boundary: { type: "heading", level: 2, title: "Section" },
        },
      },
    ];

    vi.mocked(mockService.listItems).mockResolvedValue(sectionChunks);

    const content = await getSectionContent(result, mockService);

    // The overlap removal adds a newline when overlap is not found
    expect(content).toBe(
      "First chunk with some overlapping text\noverlapping text and new content",
    );
  });

  test("handles database errors gracefully", async () => {
    const result: VectorSearchResult = {
      id: "1",
      content: "Fallback content",
      score: 0.95,
      metadata: {
        sourceId: "source-123",
        boundary: {
          type: "heading",
          level: 2,
          title: "Section",
        },
      },
    };

    vi.mocked(mockService.listItems).mockRejectedValue(new Error("DB Error"));

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const content = await getSectionContent(result, mockService);

    expect(content).toBe("Fallback content");
    expect(consoleSpy).toHaveBeenCalledWith(
      "Error retrieving section content:",
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });

  test("filters by partial boundary information", async () => {
    const result: VectorSearchResult = {
      id: "1",
      content: "Content",
      score: 0.95,
      metadata: {
        sourceId: "source-123",
        boundary: {
          type: "code",
          // No level or title
        },
      },
    };

    vi.mocked(mockService.listItems).mockResolvedValue([
      {
        id: "1",
        content: "Code block content",
        embedding: [],
        metadata: {
          sourceId: "source-123",
          chunkIndex: 0,
          boundary: { type: "code" },
        },
      },
    ]);

    const content = await getSectionContent(result, mockService);

    expect(mockService.listItems).toHaveBeenCalledWith({
      limit: 1000,
      filter: {
        sourceId: "source-123",
        "boundary.type": "code",
      },
    });

    expect(content).toBe("Code block content");
  });
});

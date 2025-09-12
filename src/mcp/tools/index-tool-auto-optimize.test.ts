import { describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../../core/database/database-service.js";
import type { IndexToolInput } from "../schemas/validation.js";
import { handleIndexOperation } from "./index-tool.js";

vi.mock("../../core/indexer/indexer.js", async () => {
  const actual = await vi.importActual("../../core/indexer/indexer.js");
  return {
    ...actual,
    indexFile: vi.fn().mockResolvedValue({
      itemsIndexed: 1,
      chunksCreated: 3,
      errors: [],
    }),
  };
});

describe("index-tool with preserve boundaries", () => {
  const mockService = {
    saveItems: vi.fn().mockResolvedValue(["id1", "id2", "id3"]),
    searchItems: vi.fn(),
    getItems: vi.fn(),
    deleteItem: vi.fn(),
    deleteAll: vi.fn(),
    getStats: vi.fn(),
  } as unknown as DatabaseService;

  it("should pass preserveBoundaries option when indexing a file", async () => {
    const { indexFile } = await import("../../core/indexer/indexer.js");
    const mockedIndexFile = vi.mocked(indexFile);

    const input: IndexToolInput = {
      type: "file",
      file: {
        path: "test.js",
      },
      preserveBoundaries: true,
    };

    const result = await handleIndexOperation(input, { service: mockService });

    expect(result.success).toBe(true);
    expect(mockedIndexFile).toHaveBeenCalledWith(
      "test.js",
      {},
      {
        chunkSize: 1000,
        chunkOverlap: 200,
        preserveBoundaries: true,
      },
      mockService,
    );
  });

  it("should default to true when preserveBoundaries is not specified", async () => {
    const { indexFile } = await import("../../core/indexer/indexer.js");
    const mockedIndexFile = vi.mocked(indexFile);

    const input: IndexToolInput = {
      type: "file",
      file: {
        path: "test.md",
      },
    };

    const result = await handleIndexOperation(input, { service: mockService });

    expect(result.success).toBe(true);
    expect(mockedIndexFile).toHaveBeenCalledWith(
      "test.md",
      {},
      {
        chunkSize: 1000,
        chunkOverlap: 200,
        preserveBoundaries: true,
      },
      mockService,
    );
  });
});

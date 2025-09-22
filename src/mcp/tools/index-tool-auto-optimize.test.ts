import { describe, expect, it, jest, mock } from "bun:test";
import type { DatabaseService } from "../../core/database/database-service.js";
import type { IndexToolInput } from "../schemas/validation.js";
import { handleIndexOperation } from "./index-tool.js";

mock.module("../../core/indexer/indexer.js", async () => {
  const actual = await import("../../core/indexer/indexer.js");
  return {
    ...actual,
    indexFile: jest.fn().mockResolvedValue({
      itemsIndexed: 1,
      chunksCreated: 3,
      errors: [],
    }),
  };
});

describe("index-tool with preserve boundaries", () => {
  const mockService = {
    saveItems: jest.fn().mockResolvedValue(["id1", "id2", "id3"]),
    searchItems: jest.fn(),
    getItems: jest.fn(),
    deleteItem: jest.fn(),
    deleteAll: jest.fn(),
    getStats: jest.fn(),
  } as unknown as DatabaseService;

  it("should pass preserveBoundaries option when indexing a file", async () => {
    const { indexFile } = await import("../../core/indexer/indexer.js");
    const mockedIndexFile = indexFile as any;

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
    const mockedIndexFile = indexFile as any;

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

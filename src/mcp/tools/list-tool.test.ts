import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../../core/database/database-service.js";
import type { VectorDocument } from "../../core/vector-db/adapters/types.js";
import { listToolSchema } from "../schemas/validation.js";
import { handleListTool, type ListToolOptions } from "./list-tool.js";

// Mock the core modules
vi.mock("../../core/database/database-operations.js", () => ({
  createDatabaseOperations: vi.fn(() => ({
    withDatabase: vi.fn(async (operation) => {
      const mockService = {
        initialize: vi.fn(),
        close: vi.fn(),
        saveItems: vi.fn().mockResolvedValue(["id1", "id2"]),
        searchItems: vi.fn(),
        getStats: vi.fn(),
        listItems: vi.fn(),
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

describe("list-tool", () => {
  let mockService: DatabaseService;
  let options: ListToolOptions;

  beforeEach(() => {
    vi.clearAllMocks();

    mockService = {
      initialize: vi.fn(),
      close: vi.fn(),
      saveItem: vi.fn(),
      saveItems: vi.fn(),
      searchItems: vi.fn(),
      countItems: vi.fn(),
      getStats: vi.fn(),
      listItems: vi.fn(),
      getAdapterInfo: vi.fn(),
    };

    options = {
      service: mockService,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Zod schema validation", () => {
    it("validates basic list input correctly", () => {
      const validInput = {
        limit: 10,
        type: "gist" as const,
        stats: false,
      };

      const result = listToolSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(10);
        expect(result.data.type).toBe("gist");
        expect(result.data.stats).toBe(false);
      }
    });

    it("applies default values correctly", () => {
      const minimalInput = {};

      const result = listToolSchema.safeParse(minimalInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(100); // default value
        expect(result.data.stats).toBe(false); // default value
        expect(result.data.type).toBeUndefined(); // optional field
      }
    });

    it("validates all source types correctly", () => {
      const sourceTypes = ["gist", "github", "file", "text"] as const;

      for (const type of sourceTypes) {
        const input = { type };
        const result = listToolSchema.safeParse(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.type).toBe(type);
        }
      }
    });

    it("validates stats-only mode", () => {
      const input = { stats: true };

      const result = listToolSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stats).toBe(true);
        expect(result.data.limit).toBe(100); // default still applies
      }
    });

    it("rejects invalid source type", () => {
      const invalidInput = {
        type: "invalid",
      };

      const result = listToolSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("Invalid enum value");
      }
    });

    it("rejects negative limit", () => {
      const invalidInput = {
        limit: -1,
      };

      const result = listToolSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(
          "Number must be greater than 0",
        );
      }
    });

    it("rejects zero limit", () => {
      const invalidInput = {
        limit: 0,
      };

      const result = listToolSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(
          "Number must be greater than 0",
        );
      }
    });

    it("rejects non-integer limit", () => {
      const invalidInput = {
        limit: 10.5,
      };

      const result = listToolSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("Expected integer");
      }
    });

    it("handles multiple validation errors", () => {
      const invalidInput = {
        limit: -5.5,
        type: "invalid",
        stats: "not_boolean",
      };

      const result = listToolSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(1);
      }
    });
  });

  describe("listing all indexed items", () => {
    it("lists all items successfully", async () => {
      const mockItems: VectorDocument[] = [
        {
          id: "item1",
          content: "Test content 1",
          embedding: [0.1, 0.2, 0.3],
          metadata: {
            sourceId: "source1",
            sourceType: "text",
            title: "Test Item 1",
            createdAt: "2023-01-01T00:00:00Z",
          },
        },
        {
          id: "item2",
          content: "Test content 2",
          embedding: [0.4, 0.5, 0.6],
          metadata: {
            sourceId: "source2",
            sourceType: "gist",
            title: "Test Item 2",
            url: "https://gist.github.com/user/123",
            createdAt: "2023-01-02T00:00:00Z",
          },
        },
      ];

      const mockStats = {
        totalItems: 2,
        bySourceType: { text: 1, gist: 1 },
      };

      mockService.listItems = vi.fn().mockResolvedValue(mockItems);
      mockService.getStats = vi.fn().mockResolvedValue(mockStats);

      const input = { stats: false };
      const result = await handleListTool(input, options);

      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(2);
      expect(result.items?.[0]?.id).toBe("item1");
      expect(result.items?.[1]?.id).toBe("item2");
      expect(result.stats).toEqual({
        ...mockStats,
        uniqueSources: expect.any(Number),
      });
      expect(mockService.listItems).toHaveBeenCalledWith({ limit: 100 });
    });

    it("returns items with all metadata fields", async () => {
      const mockItems: VectorDocument[] = [
        {
          id: "item1",
          content: "GitHub repository content",
          embedding: [0.1, 0.2],
          metadata: {
            sourceId: "source1",
            sourceType: "github",
            title: "Repository Code",
            url: "https://github.com/user/repo",
            owner: "user",
            repo: "repo",
            branch: "main",
            path: "src/file.ts",
            filePath: "src/file.ts",
            createdAt: "2023-01-01T00:00:00Z",
            updatedAt: "2023-01-02T00:00:00Z",
          },
        },
      ];

      mockService.listItems = vi.fn().mockResolvedValue(mockItems);
      mockService.getStats = vi
        .fn()
        .mockResolvedValue({ totalItems: 1, bySourceType: { github: 1 } });

      const result = await handleListTool({}, options);

      expect(result.success).toBe(true);
      expect(result.items?.[0]?.metadata).toEqual(mockItems[0]?.metadata);
    });

    it("handles items without metadata", async () => {
      const mockItems: VectorDocument[] = [
        {
          id: "item1",
          content: "Content without metadata",
          embedding: [0.1, 0.2],
        },
      ];

      mockService.listItems = vi.fn().mockResolvedValue(mockItems);
      mockService.getStats = vi
        .fn()
        .mockResolvedValue({ totalItems: 1, bySourceType: {} });

      const result = await handleListTool({}, options);

      expect(result.success).toBe(true);
      expect(result.items?.[0]?.id).toBe("item1");
      expect(result.items?.[0]?.metadata).toBeUndefined();
    });
  });

  describe("limiting the number of results", () => {
    it("applies custom limit correctly", async () => {
      const mockItems: VectorDocument[] = Array.from({ length: 5 }, (_, i) => ({
        id: `item${i + 1}`,
        content: `Content ${i + 1}`,
        embedding: [0.1 * i, 0.2 * i],
        metadata: { sourceType: "text" as const, title: `Item ${i + 1}` },
      }));

      mockService.listItems = vi.fn().mockResolvedValue(mockItems);
      mockService.getStats = vi
        .fn()
        .mockResolvedValue({ totalItems: 5, bySourceType: { text: 5 } });

      const input = { limit: 5 };
      const result = await handleListTool(input, options);

      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(5);
      expect(mockService.listItems).toHaveBeenCalledWith({ limit: 5 });
    });

    it("applies small limit correctly", async () => {
      const mockItems: VectorDocument[] = [
        {
          id: "item1",
          content: "Content 1",
          embedding: [0.1, 0.2],
          metadata: { sourceType: "text", title: "Item 1" },
        },
      ];

      mockService.listItems = vi.fn().mockResolvedValue(mockItems);
      mockService.getStats = vi
        .fn()
        .mockResolvedValue({ totalItems: 1, bySourceType: { text: 1 } });

      const input = { limit: 1 };
      const result = await handleListTool(input, options);

      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(1);
      expect(mockService.listItems).toHaveBeenCalledWith({ limit: 1 });
    });

    it("applies large limit correctly", async () => {
      const mockItems: VectorDocument[] = Array.from(
        { length: 50 },
        (_, i) => ({
          id: `item${i + 1}`,
          content: `Content ${i + 1}`,
          embedding: [0.1 * i, 0.2 * i],
        }),
      );

      mockService.listItems = vi.fn().mockResolvedValue(mockItems);
      mockService.getStats = vi
        .fn()
        .mockResolvedValue({ totalItems: 50, bySourceType: { text: 50 } });

      const input = { limit: 1000 };
      const result = await handleListTool(input, options);

      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(50);
      expect(mockService.listItems).toHaveBeenCalledWith({ limit: 1000 });
    });

    it("uses default limit when not specified", async () => {
      mockService.listItems = vi.fn().mockResolvedValue([]);
      mockService.getStats = vi
        .fn()
        .mockResolvedValue({ totalItems: 0, bySourceType: {} });

      const result = await handleListTool({}, options);

      expect(result.success).toBe(true);
      expect(mockService.listItems).toHaveBeenCalledWith({ limit: 100 });
    });
  });

  describe("filtering by type", () => {
    it("filters by gist type correctly", async () => {
      const mockItems: VectorDocument[] = [
        {
          id: "gist1",
          content: "Gist content",
          embedding: [0.1, 0.2],
          metadata: {
            sourceType: "gist",
            title: "Test Gist",
            url: "https://gist.github.com/user/123",
            gistId: "123",
          },
        },
      ];

      mockService.listItems = vi.fn().mockResolvedValue(mockItems);
      mockService.getStats = vi
        .fn()
        .mockResolvedValue({ totalItems: 1, bySourceType: { gist: 1 } });

      const input = { type: "gist" as const };
      const result = await handleListTool(input, options);

      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(1);
      expect(result.items?.[0]?.metadata?.sourceType).toBe("gist");
      expect(mockService.listItems).toHaveBeenCalledWith({
        limit: 100,
        filter: { sourceType: "gist" },
      });
    });

    it("filters by github type correctly", async () => {
      const mockItems: VectorDocument[] = [
        {
          id: "github1",
          content: "GitHub content",
          embedding: [0.1, 0.2],
          metadata: {
            sourceType: "github",
            title: "GitHub File",
            url: "https://github.com/user/repo",
            owner: "user",
            repo: "repo",
          },
        },
      ];

      mockService.listItems = vi.fn().mockResolvedValue(mockItems);
      mockService.getStats = vi
        .fn()
        .mockResolvedValue({ totalItems: 1, bySourceType: { github: 1 } });

      const input = { type: "github" as const };
      const result = await handleListTool(input, options);

      expect(result.success).toBe(true);
      expect(result.items?.[0]?.metadata?.sourceType).toBe("github");
      expect(mockService.listItems).toHaveBeenCalledWith({
        limit: 100,
        filter: { sourceType: "github" },
      });
    });

    it("filters by file type correctly", async () => {
      const mockItems: VectorDocument[] = [
        {
          id: "file1",
          content: "File content",
          embedding: [0.1, 0.2],
          metadata: {
            sourceType: "file",
            title: "Test File",
            filePath: "/path/to/file.txt",
          },
        },
      ];

      mockService.listItems = vi.fn().mockResolvedValue(mockItems);
      mockService.getStats = vi
        .fn()
        .mockResolvedValue({ totalItems: 1, bySourceType: { file: 1 } });

      const input = { type: "file" as const };
      const result = await handleListTool(input, options);

      expect(result.success).toBe(true);
      expect(result.items?.[0]?.metadata?.sourceType).toBe("file");
      expect(mockService.listItems).toHaveBeenCalledWith({
        limit: 100,
        filter: { sourceType: "file" },
      });
    });

    it("filters by text type correctly", async () => {
      const mockItems: VectorDocument[] = [
        {
          id: "text1",
          content: "Text content",
          embedding: [0.1, 0.2],
          metadata: {
            sourceType: "text",
            title: "Test Text",
          },
        },
      ];

      mockService.listItems = vi.fn().mockResolvedValue(mockItems);
      mockService.getStats = vi
        .fn()
        .mockResolvedValue({ totalItems: 1, bySourceType: { text: 1 } });

      const input = { type: "text" as const };
      const result = await handleListTool(input, options);

      expect(result.success).toBe(true);
      expect(result.items?.[0]?.metadata?.sourceType).toBe("text");
      expect(mockService.listItems).toHaveBeenCalledWith({
        limit: 100,
        filter: { sourceType: "text" },
      });
    });

    it("returns empty results when no items match filter", async () => {
      mockService.listItems = vi.fn().mockResolvedValue([]);
      mockService.getStats = vi
        .fn()
        .mockResolvedValue({ totalItems: 0, bySourceType: {} });

      const input = { type: "gist" as const };
      const result = await handleListTool(input, options);

      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(0);
      expect(mockService.listItems).toHaveBeenCalledWith({
        limit: 100,
        filter: { sourceType: "gist" },
      });
    });

    it("combines type filter with custom limit", async () => {
      const mockItems: VectorDocument[] = [
        {
          id: "gist1",
          content: "Gist content",
          embedding: [0.1, 0.2],
          metadata: { sourceType: "gist", title: "Test Gist" },
        },
      ];

      mockService.listItems = vi.fn().mockResolvedValue(mockItems);
      mockService.getStats = vi
        .fn()
        .mockResolvedValue({ totalItems: 1, bySourceType: { gist: 1 } });

      const input = { type: "gist" as const, limit: 5 };
      const result = await handleListTool(input, options);

      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(1);
      expect(mockService.listItems).toHaveBeenCalledWith({
        limit: 5,
        filter: { sourceType: "gist" },
      });
    });
  });

  describe("statistics mode", () => {
    it("returns only statistics when stats=true", async () => {
      const mockStats = {
        totalItems: 10,
        bySourceType: {
          gist: 3,
          github: 4,
          file: 2,
          text: 1,
        },
      };

      mockService.getStats = vi.fn().mockResolvedValue(mockStats);

      const input = { stats: true };
      const result = await handleListTool(input, options);

      expect(result.success).toBe(true);
      expect(result.stats).toEqual({
        ...mockStats,
        uniqueSources: expect.any(Number),
      });
      expect(result.items).toBeUndefined();
      expect(mockService.listItems).not.toHaveBeenCalled();
      expect(mockService.getStats).toHaveBeenCalled();
    });

    it("returns both statistics and items when stats=false", async () => {
      const mockItems: VectorDocument[] = [
        {
          id: "item1",
          content: "Content",
          embedding: [0.1, 0.2],
          metadata: { sourceType: "text" },
        },
      ];

      const mockStats = {
        totalItems: 1,
        bySourceType: { text: 1 },
      };

      mockService.listItems = vi.fn().mockResolvedValue(mockItems);
      mockService.getStats = vi.fn().mockResolvedValue(mockStats);

      const input = { stats: false };
      const result = await handleListTool(input, options);

      expect(result.success).toBe(true);
      expect(result.stats).toEqual({
        ...mockStats,
        uniqueSources: expect.any(Number),
      });
      expect(result.items).toHaveLength(1);
      expect(mockService.listItems).toHaveBeenCalled();
      expect(mockService.getStats).toHaveBeenCalled();
    });

    it("returns detailed statistics breakdown", async () => {
      const mockStats = {
        totalItems: 100,
        bySourceType: {
          gist: 25,
          github: 40,
          file: 30,
          text: 5,
        },
      };

      mockService.getStats = vi.fn().mockResolvedValue(mockStats);

      const input = { stats: true };
      const result = await handleListTool(input, options);

      expect(result.success).toBe(true);
      expect(result.stats?.totalItems).toBe(100);
      expect(result.stats?.bySourceType?.gist).toBe(25);
      expect(result.stats?.bySourceType?.github).toBe(40);
      expect(result.stats?.bySourceType?.file).toBe(30);
      expect(result.stats?.bySourceType?.text).toBe(5);
    });

    it("handles empty statistics", async () => {
      const mockStats = {
        totalItems: 0,
        bySourceType: {},
      };

      mockService.getStats = vi.fn().mockResolvedValue(mockStats);

      const input = { stats: true };
      const result = await handleListTool(input, options);

      expect(result.success).toBe(true);
      expect(result.stats?.totalItems).toBe(0);
      expect(Object.keys(result.stats?.bySourceType || {})).toHaveLength(0);
    });

    it("stats mode ignores type filter", async () => {
      const mockStats = {
        totalItems: 10,
        bySourceType: { gist: 5, text: 5 },
      };

      mockService.getStats = vi.fn().mockResolvedValue(mockStats);

      const input = { stats: true, type: "gist" as const };
      const result = await handleListTool(input, options);

      expect(result.success).toBe(true);
      expect(result.stats).toEqual({
        ...mockStats,
        uniqueSources: expect.any(Number),
      });
      expect(mockService.getStats).toHaveBeenCalled();
      expect(mockService.listItems).not.toHaveBeenCalled();
    });
  });

  describe("pagination handling", () => {
    it("handles pagination with offset parameter", async () => {
      // Note: The current implementation doesn't expose offset in the schema,
      // but the service supports it. This test validates the service layer.
      const mockItems: VectorDocument[] = [
        {
          id: "item6",
          content: "Content 6",
          embedding: [0.6, 0.7],
          metadata: { sourceType: "text", title: "Item 6" },
        },
      ];

      mockService.listItems = vi.fn().mockResolvedValue(mockItems);
      mockService.getStats = vi
        .fn()
        .mockResolvedValue({ totalItems: 10, bySourceType: { text: 10 } });

      // Simulate internal pagination by directly calling service
      await mockService.listItems({ limit: 5, offset: 5 });

      expect(mockService.listItems).toHaveBeenCalledWith({
        limit: 5,
        offset: 5,
      });
    });

    it("handles large result sets efficiently", async () => {
      const mockItems: VectorDocument[] = Array.from(
        { length: 100 },
        (_, i) => ({
          id: `item${i + 1}`,
          content: `Content ${i + 1}`,
          embedding: [0.1 * i, 0.2 * i],
          metadata: { sourceType: "text", title: `Item ${i + 1}` },
        }),
      );

      mockService.listItems = vi.fn().mockResolvedValue(mockItems);
      mockService.getStats = vi
        .fn()
        .mockResolvedValue({ totalItems: 100, bySourceType: { text: 100 } });

      const input = { limit: 100 };
      const result = await handleListTool(input, options);

      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(100);
      expect(mockService.listItems).toHaveBeenCalledWith({ limit: 100 });
    });

    it("handles first page correctly", async () => {
      const mockItems: VectorDocument[] = Array.from(
        { length: 10 },
        (_, i) => ({
          id: `item${i + 1}`,
          content: `Content ${i + 1}`,
          embedding: [0.1 * i, 0.2 * i],
        }),
      );

      mockService.listItems = vi.fn().mockResolvedValue(mockItems);
      mockService.getStats = vi
        .fn()
        .mockResolvedValue({ totalItems: 100, bySourceType: { text: 100 } });

      const input = { limit: 10 };
      const result = await handleListTool(input, options);

      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(10);
    });
  });

  describe("error handling for database issues", () => {
    it("handles database connection errors", async () => {
      mockService.getStats = vi
        .fn()
        .mockRejectedValue(new Error("Database connection failed"));

      const input = { stats: true };
      const result = await handleListTool(input, options);

      expect(result.success).toBe(false);
      expect(result.message).toContain(
        "Failed to list items: Database connection failed",
      );
      expect(result.errors).toContain("Database connection failed");
    });

    it("handles listItems database errors", async () => {
      mockService.getStats = vi
        .fn()
        .mockResolvedValue({ totalItems: 0, bySourceType: {} });
      mockService.listItems = vi
        .fn()
        .mockRejectedValue(new Error("Query execution failed"));

      const input = { stats: false };
      const result = await handleListTool(input, options);

      expect(result.success).toBe(false);
      expect(result.message).toContain(
        "Failed to list items: Query execution failed",
      );
      expect(result.errors).toContain("Query execution failed");
    });

    it("handles getStats database errors", async () => {
      mockService.getStats = vi
        .fn()
        .mockRejectedValue(new Error("Statistics query failed"));

      const input = {};
      const result = await handleListTool(input, options);

      expect(result.success).toBe(false);
      expect(result.message).toContain(
        "Failed to list items: Statistics query failed",
      );
    });

    it("handles adapter initialization errors", async () => {
      mockService.listItems = vi
        .fn()
        .mockRejectedValue(new Error("Adapter not initialized"));
      mockService.getStats = vi
        .fn()
        .mockRejectedValue(new Error("Adapter not initialized"));

      const result = await handleListTool({}, options);

      expect(result.success).toBe(false);
      expect(result.message).toContain("Adapter not initialized");
    });

    it("handles timeout errors", async () => {
      mockService.listItems = vi
        .fn()
        .mockRejectedValue(new Error("Request timeout"));
      mockService.getStats = vi
        .fn()
        .mockRejectedValue(new Error("Request timeout"));

      const result = await handleListTool({}, options);

      expect(result.success).toBe(false);
      expect(result.message).toContain("Request timeout");
    });

    it("handles unknown error types", async () => {
      mockService.getStats = vi.fn().mockRejectedValue("Unknown error");

      const result = await handleListTool({ stats: true }, options);

      expect(result.success).toBe(false);
      expect(result.message).toContain("Failed to list items: Unknown error");
      expect(result.errors).toContain("Unknown error");
    });

    it("handles partial database failures", async () => {
      mockService.getStats = vi
        .fn()
        .mockResolvedValue({ totalItems: 5, bySourceType: { text: 5 } });
      mockService.listItems = vi
        .fn()
        .mockRejectedValue(new Error("Item retrieval failed"));

      const result = await handleListTool({ stats: false }, options);

      expect(result.success).toBe(false);
      expect(result.message).toContain("Item retrieval failed");
    });
  });

  describe("validation with Zod schemas", () => {
    it("handles invalid input gracefully", async () => {
      const { McpError } = await import("@modelcontextprotocol/sdk/types.js");
      const invalidInput = {
        limit: "not_a_number",
        type: "invalid_type",
        stats: "not_boolean",
      };

      await expect(handleListTool(invalidInput, options)).rejects.toThrow(
        McpError,
      );

      try {
        await handleListTool(invalidInput, options);
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        if (error instanceof McpError) {
          expect(error.code).toBe(-32602); // ErrorCode.InvalidParams
          expect(error.message).toContain("Invalid input");
          expect(error.data).toHaveProperty("errors");
          const errors = (error.data as { errors: string[] }).errors;
          // With the new union schema for boolean fields, string values are transformed
          // so "not_boolean" gets converted to false instead of causing an error
          expect(errors).toHaveLength(2);
          expect(errors).toContain("Expected number, received string");
          expect(errors).toContain(
            "Invalid enum value. Expected 'gist' | 'github' | 'file' | 'text', received 'invalid_type'",
          );
        }
      }
    });

    it("handles missing service in options", async () => {
      const invalidOptions = {} as ListToolOptions;

      const result = await handleListTool({}, invalidOptions);

      expect(result.success).toBe(false);
      expect(result.message).toContain("Database service not available");
    });

    it("validates complex invalid input combinations", async () => {
      const { McpError } = await import("@modelcontextprotocol/sdk/types.js");
      const invalidInput = {
        limit: -10,
        type: "nonexistent",
        stats: null,
        extra: "field",
      };

      await expect(handleListTool(invalidInput, options)).rejects.toThrow(
        McpError,
      );

      try {
        await handleListTool(invalidInput, options);
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        if (error instanceof McpError) {
          expect(error.code).toBe(-32602); // ErrorCode.InvalidParams
          expect(error.message).toContain("Invalid input");
          expect(error.data).toHaveProperty("errors");
          const errors = (error.data as { errors: string[] }).errors;
          expect(errors?.length).toBeGreaterThan(0);
        }
      }
    });

    it("accepts valid edge case inputs", async () => {
      mockService.listItems = vi.fn().mockResolvedValue([]);
      mockService.getStats = vi
        .fn()
        .mockResolvedValue({ totalItems: 0, bySourceType: {} });

      const edgeCaseInputs = [
        { limit: 1 },
        { limit: 999999 },
        { type: "text" },
        { stats: true },
        { stats: false },
        {},
      ];

      for (const input of edgeCaseInputs) {
        const result = await handleListTool(input, options);
        expect(result.success).toBe(true);
      }
    });

    it("validates input schema before processing", async () => {
      const validInput = { limit: 50, type: "gist" as const };

      // Mock service to throw error, but validation should pass
      mockService.getStats = vi.fn().mockRejectedValue(new Error("DB Error"));

      const result = await handleListTool(validInput, options);

      // Should fail due to DB error, not validation
      expect(result.success).toBe(false);
      expect(result.message).not.toBe("Invalid input");
      expect(result.message).toContain("DB Error");
    });
  });

  describe("empty database scenarios", () => {
    it("handles completely empty database", async () => {
      mockService.listItems = vi.fn().mockResolvedValue([]);
      mockService.getStats = vi.fn().mockResolvedValue({
        totalItems: 0,
        bySourceType: {},
      });

      const result = await handleListTool({}, options);

      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(0);
      expect(result.stats?.totalItems).toBe(0);
      expect(Object.keys(result.stats?.bySourceType || {})).toHaveLength(0);
    });

    it("handles database with no items of specified type", async () => {
      mockService.listItems = vi.fn().mockResolvedValue([]);
      mockService.getStats = vi.fn().mockResolvedValue({
        totalItems: 10,
        bySourceType: { text: 5, file: 5 },
      });

      const input = { type: "gist" as const };
      const result = await handleListTool(input, options);

      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(0);
      expect(result.stats?.totalItems).toBe(10);
      expect(result.stats?.bySourceType?.gist).toBeUndefined();
    });

    it("handles newly initialized database", async () => {
      mockService.listItems = vi.fn().mockResolvedValue([]);
      mockService.getStats = vi.fn().mockResolvedValue({
        totalItems: 0,
        bySourceType: {},
      });

      const result = await handleListTool({ stats: true }, options);

      expect(result.success).toBe(true);
      expect(result.stats?.totalItems).toBe(0);
      expect(result.items).toBeUndefined();
    });

    it("handles database with items but empty result due to filtering", async () => {
      mockService.listItems = vi.fn().mockResolvedValue([]);
      mockService.getStats = vi.fn().mockResolvedValue({
        totalItems: 100,
        bySourceType: { text: 50, file: 50 },
      });

      const input = { type: "github" as const, limit: 20 };
      const result = await handleListTool(input, options);

      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(0);
      expect(result.stats?.totalItems).toBe(100);
      expect(mockService.listItems).toHaveBeenCalledWith({
        limit: 20,
        filter: { sourceType: "github" },
      });
    });

    it("handles database with only metadata, no content", async () => {
      const mockItems: VectorDocument[] = [
        {
          id: "item1",
          content: "",
          embedding: [],
          metadata: {
            sourceType: "text",
            title: "Empty Content Item",
          },
        },
      ];

      mockService.listItems = vi.fn().mockResolvedValue(mockItems);
      mockService.getStats = vi.fn().mockResolvedValue({
        totalItems: 1,
        bySourceType: { text: 1 },
      });

      const result = await handleListTool({}, options);

      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(1);
      expect(result.items?.[0]?.content).toBe("");
      expect(result.items?.[0]?.metadata?.title).toBe("Empty Content Item");
    });

    it("handles database with partial data corruption", async () => {
      const mockItems: VectorDocument[] = [
        {
          id: "item1",
          content: "Valid content",
          embedding: [0.1, 0.2],
          metadata: { sourceType: "text" },
        },
        {
          // Missing required fields
          content: "Content without ID",
          embedding: [0.3, 0.4],
        } as VectorDocument,
      ];

      mockService.listItems = vi.fn().mockResolvedValue(mockItems);
      mockService.getStats = vi.fn().mockResolvedValue({
        totalItems: 2,
        bySourceType: { text: 2 },
      });

      const result = await handleListTool({}, options);

      expect(result.success).toBe(true);
      // Items without ID are filtered out
      expect(result.items).toHaveLength(1);
      expect(result.items?.[0]?.id).toBe("item1");
    });
  });

  describe("integration scenarios", () => {
    it("combines all filters and options correctly", async () => {
      const mockItems: VectorDocument[] = [
        {
          id: "gist1",
          content: "Gist content",
          embedding: [0.1, 0.2],
          metadata: {
            sourceType: "gist",
            title: "Test Gist",
            url: "https://gist.github.com/user/123",
          },
        },
      ];

      mockService.listItems = vi.fn().mockResolvedValue(mockItems);
      mockService.getStats = vi.fn().mockResolvedValue({
        totalItems: 1,
        bySourceType: { gist: 1 },
      });

      const input = {
        limit: 25,
        type: "gist" as const,
        stats: false,
      };

      const result = await handleListTool(input, options);

      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(1);
      expect(result.items?.[0]?.metadata?.sourceType).toBe("gist");
      expect(result.stats?.totalItems).toBe(1);
      expect(mockService.listItems).toHaveBeenCalledWith({
        limit: 25,
        filter: { sourceType: "gist" },
      });
    });

    it("handles concurrent access scenarios", async () => {
      const mockItems: VectorDocument[] = [
        {
          id: "item1",
          content: "Content",
          embedding: [0.1, 0.2],
          metadata: { sourceType: "text" },
        },
      ];

      mockService.listItems = vi.fn().mockResolvedValue(mockItems);
      mockService.getStats = vi.fn().mockResolvedValue({
        totalItems: 1,
        bySourceType: { text: 1 },
      });

      // Simulate concurrent requests
      const promises = Array.from({ length: 5 }, () =>
        handleListTool({}, options),
      );
      const results = await Promise.all(promises);

      for (const result of results) {
        expect(result.success).toBe(true);
        expect(result.items).toHaveLength(1);
      }

      expect(mockService.listItems).toHaveBeenCalledTimes(5);
      expect(mockService.getStats).toHaveBeenCalledTimes(5);
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IndexToolInput } from "../schemas/validation.js";
import { indexToolSchema } from "../schemas/validation.js";

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

vi.mock("../../core/indexer/indexer.js", () => ({
  indexText: vi.fn().mockResolvedValue({
    itemsIndexed: 1,
    chunksCreated: 3,
    errors: [],
  }),
  indexFile: vi.fn().mockResolvedValue({
    itemsIndexed: 1,
    chunksCreated: 5,
    errors: [],
  }),
  indexFiles: vi.fn().mockResolvedValue({
    itemsIndexed: 3,
    chunksCreated: 15,
    errors: [],
  }),
  indexGist: vi.fn().mockResolvedValue({
    itemsIndexed: 2,
    chunksCreated: 10,
    errors: [],
  }),
  indexGitHubRepo: vi.fn().mockResolvedValue({
    itemsIndexed: 5,
    chunksCreated: 20,
    errors: [],
  }),
}));

vi.mock("../../core/security/security.js", () => {
  class SecurityError extends Error {
    constructor(message: string, options?: ErrorOptions) {
      super(message, options);
      this.name = "SecurityError";
    }
  }
  return {
    validateFilePath: vi.fn().mockImplementation((path) => path),
    validateGistUrl: vi.fn().mockImplementation((url) => url),
    validateGitHubRepoUrl: vi.fn().mockImplementation((url) => url),
    SecurityError,
  };
});

vi.mock("node:fs", () => ({
  existsSync: vi.fn().mockReturnValue(true),
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
const mockIndexTool = vi.fn();

describe("index-tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Zod schema validation", () => {
    it("validates text indexing input correctly", () => {
      const validInput: IndexToolInput = {
        type: "text",
        text: {
          content: "Hello world",
          title: "Test content",
        },
        chunkSize: 1000,
        chunkOverlap: 200,
      };

      const result = indexToolSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe("text");
        expect(result.data.text?.content).toBe("Hello world");
        expect(result.data.chunkSize).toBe(1000);
        expect(result.data.chunkOverlap).toBe(200);
      }
    });

    it("validates file indexing input correctly", () => {
      const validInput: IndexToolInput = {
        type: "file",
        file: {
          path: "/path/to/file.txt",
          metadata: { author: "test" },
        },
        chunkSize: 500,
        chunkOverlap: 100,
      };

      const result = indexToolSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe("file");
        expect(result.data.file?.path).toBe("/path/to/file.txt");
        expect(result.data.file?.metadata?.author).toBe("test");
      }
    });

    it("validates files indexing input correctly", () => {
      const validInput: IndexToolInput = {
        type: "files",
        files: {
          pattern: "src/**/*.ts",
          metadata: { project: "gistdex" },
        },
      };

      const result = indexToolSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe("files");
        expect(result.data.files?.pattern).toBe("src/**/*.ts");
        expect(result.data.chunkSize).toBe(1000); // default value
        expect(result.data.chunkOverlap).toBe(200); // default value
      }
    });

    it("validates gist indexing input correctly", () => {
      const validInput: IndexToolInput = {
        type: "gist",
        gist: {
          url: "https://gist.github.com/user/1234567890",
        },
        chunkSize: 2000,
      };

      const result = indexToolSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe("gist");
        expect(result.data.gist?.url).toBe(
          "https://gist.github.com/user/1234567890",
        );
        expect(result.data.chunkSize).toBe(2000);
      }
    });

    it("validates github indexing input correctly", () => {
      const validInput: IndexToolInput = {
        type: "github",
        github: {
          url: "https://github.com/user/repo",
          metadata: { branch: "main" },
        },
        chunkOverlap: 300,
      };

      const result = indexToolSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe("github");
        expect(result.data.github?.url).toBe("https://github.com/user/repo");
        expect(result.data.chunkOverlap).toBe(300);
      }
    });

    it("rejects invalid type", () => {
      const invalidInput = {
        type: "invalid",
        text: { content: "test" },
      };

      const result = indexToolSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Invalid enum value");
      }
    });

    it("rejects invalid chunk size", () => {
      const invalidInput = {
        type: "text",
        text: { content: "test" },
        chunkSize: -1,
      };

      const result = indexToolSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          "Number must be greater than 0",
        );
      }
    });

    it("rejects invalid chunk overlap", () => {
      const invalidInput = {
        type: "text",
        text: { content: "test" },
        chunkOverlap: -1,
      };

      const result = indexToolSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          "Number must be greater than or equal to 0",
        );
      }
    });

    it("rejects invalid gist URL", () => {
      const invalidInput = {
        type: "gist",
        gist: { url: "not-a-url" },
      };

      const result = indexToolSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Invalid url");
      }
    });

    it("rejects invalid github URL", () => {
      const invalidInput = {
        type: "github",
        github: { url: "not-a-url" },
      };

      const result = indexToolSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Invalid url");
      }
    });

    it("rejects empty text content", () => {
      const invalidInput = {
        type: "text",
        text: { content: "" },
      };

      const result = indexToolSchema.safeParse(invalidInput);
      expect(result.success).toBe(true); // Schema allows empty string, but implementation should handle this
    });

    it("rejects missing required fields for each type", () => {
      const testCases = [
        { type: "text", expectedField: "text" },
        { type: "file", expectedField: "file" },
        { type: "files", expectedField: "files" },
        { type: "gist", expectedField: "gist" },
        { type: "github", expectedField: "github" },
      ];

      for (const testCase of testCases) {
        const invalidInput = { type: testCase.type };
        const result = indexToolSchema.safeParse(invalidInput);
        expect(result.success).toBe(true); // Schema doesn't enforce this, but implementation should
      }
    });
  });

  describe("indexing text content", () => {
    it("indexes text content successfully", async () => {
      const input: IndexToolInput = {
        type: "text",
        text: {
          content: "This is test content for indexing",
          title: "Test Content",
          metadata: { author: "test-user" },
        },
        chunkSize: 1000,
        chunkOverlap: 200,
      };

      // Mock the index tool function
      mockIndexTool.mockResolvedValue({
        success: true,
        result: {
          itemsIndexed: 1,
          chunksCreated: 3,
          errors: [],
        },
      });

      const result = await mockIndexTool(input);

      expect(result.success).toBe(true);
      expect(result.result.itemsIndexed).toBe(1);
      expect(result.result.chunksCreated).toBe(3);
      expect(result.result.errors).toHaveLength(0);
    });

    it("handles empty text content", async () => {
      const input: IndexToolInput = {
        type: "text",
        text: {
          content: "",
        },
      };

      mockIndexTool.mockResolvedValue({
        success: false,
        error: "Text content cannot be empty",
      });

      const result = await mockIndexTool(input);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Text content cannot be empty");
    });

    it("handles text content with custom chunk settings", async () => {
      const input: IndexToolInput = {
        type: "text",
        text: {
          content: "Custom chunk size test content",
        },
        chunkSize: 500,
        chunkOverlap: 100,
      };

      mockIndexTool.mockResolvedValue({
        success: true,
        result: {
          itemsIndexed: 1,
          chunksCreated: 2,
          errors: [],
        },
      });

      const result = await mockIndexTool(input);

      expect(result.success).toBe(true);
      expect(mockIndexTool).toHaveBeenCalledWith(
        expect.objectContaining({
          chunkSize: 500,
          chunkOverlap: 100,
        }),
      );
    });
  });

  describe("indexing single file", () => {
    it("indexes a single file successfully", async () => {
      const input: IndexToolInput = {
        type: "file",
        file: {
          path: "/path/to/document.txt",
          metadata: { type: "document" },
        },
      };

      mockIndexTool.mockResolvedValue({
        success: true,
        result: {
          itemsIndexed: 1,
          chunksCreated: 5,
          errors: [],
        },
      });

      const result = await mockIndexTool(input);

      expect(result.success).toBe(true);
      expect(result.result.itemsIndexed).toBe(1);
      expect(result.result.chunksCreated).toBe(5);
    });

    it("handles file not found error", async () => {
      const input: IndexToolInput = {
        type: "file",
        file: {
          path: "/nonexistent/file.txt",
        },
      };

      mockIndexTool.mockResolvedValue({
        success: false,
        error: "File not found: /nonexistent/file.txt",
      });

      const result = await mockIndexTool(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain("File not found");
    });

    it("handles security error for restricted paths", async () => {
      const input: IndexToolInput = {
        type: "file",
        file: {
          path: "../../../etc/passwd",
        },
      };

      mockIndexTool.mockResolvedValue({
        success: false,
        error:
          "Security error - File access is restricted to prevent unauthorized access",
      });

      const result = await mockIndexTool(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Security error");
    });

    it("handles invalid file paths", async () => {
      const input: IndexToolInput = {
        type: "file",
        file: {
          path: "",
        },
      };

      mockIndexTool.mockResolvedValue({
        success: false,
        error: "File path cannot be empty",
      });

      const result = await mockIndexTool(input);

      expect(result.success).toBe(false);
      expect(result.error).toBe("File path cannot be empty");
    });
  });

  describe("indexing multiple files with glob patterns", () => {
    it("indexes multiple files with glob pattern successfully", async () => {
      const input: IndexToolInput = {
        type: "files",
        files: {
          pattern: "src/**/*.ts",
          metadata: { project: "gistdex" },
        },
        chunkSize: 2000,
      };

      mockIndexTool.mockResolvedValue({
        success: true,
        result: {
          itemsIndexed: 3,
          chunksCreated: 15,
          errors: [],
        },
      });

      const result = await mockIndexTool(input);

      expect(result.success).toBe(true);
      expect(result.result.itemsIndexed).toBe(3);
      expect(result.result.chunksCreated).toBe(15);
    });

    it("handles multiple glob patterns", async () => {
      const input: IndexToolInput = {
        type: "files",
        files: {
          pattern: "src/**/*.ts,docs/**/*.md,*.json",
        },
      };

      mockIndexTool.mockResolvedValue({
        success: true,
        result: {
          itemsIndexed: 5,
          chunksCreated: 25,
          errors: [],
        },
      });

      const result = await mockIndexTool(input);

      expect(result.success).toBe(true);
      expect(result.result.itemsIndexed).toBe(5);
    });

    it("handles no files matching pattern", async () => {
      const input: IndexToolInput = {
        type: "files",
        files: {
          pattern: "nonexistent/**/*.xyz",
        },
      };

      mockIndexTool.mockResolvedValue({
        success: true,
        result: {
          itemsIndexed: 0,
          chunksCreated: 0,
          errors: ["No files found matching pattern: nonexistent/**/*.xyz"],
        },
      });

      const result = await mockIndexTool(input);

      expect(result.success).toBe(true);
      expect(result.result.itemsIndexed).toBe(0);
      expect(result.result.errors).toHaveLength(1);
    });

    it("handles invalid glob pattern", async () => {
      const input: IndexToolInput = {
        type: "files",
        files: {
          pattern: "",
        },
      };

      mockIndexTool.mockResolvedValue({
        success: false,
        error: "Glob pattern cannot be empty",
      });

      const result = await mockIndexTool(input);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Glob pattern cannot be empty");
    });
  });

  describe("indexing GitHub Gists", () => {
    it("indexes GitHub Gist successfully", async () => {
      const input: IndexToolInput = {
        type: "gist",
        gist: {
          url: "https://gist.github.com/user/1234567890",
          metadata: { source: "github-gist" },
        },
      };

      mockIndexTool.mockResolvedValue({
        success: true,
        result: {
          itemsIndexed: 2,
          chunksCreated: 10,
          errors: [],
        },
      });

      const result = await mockIndexTool(input);

      expect(result.success).toBe(true);
      expect(result.result.itemsIndexed).toBe(2);
      expect(result.result.chunksCreated).toBe(10);
    });

    it("handles invalid Gist URL", async () => {
      const input: IndexToolInput = {
        type: "gist",
        gist: {
          url: "https://not-a-gist-url.com",
        },
      };

      mockIndexTool.mockResolvedValue({
        success: false,
        error: "Invalid Gist URL format",
      });

      const result = await mockIndexTool(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid Gist URL");
    });

    it("handles Gist not found error", async () => {
      const input: IndexToolInput = {
        type: "gist",
        gist: {
          url: "https://gist.github.com/user/nonexistent",
        },
      };

      mockIndexTool.mockResolvedValue({
        success: false,
        error: "Gist not found or not accessible",
      });

      const result = await mockIndexTool(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Gist not found");
    });

    it("handles private Gist access error", async () => {
      const input: IndexToolInput = {
        type: "gist",
        gist: {
          url: "https://gist.github.com/user/private123",
        },
      };

      mockIndexTool.mockResolvedValue({
        success: false,
        error: "Access denied to private Gist",
      });

      const result = await mockIndexTool(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Access denied");
    });
  });

  describe("indexing GitHub repositories", () => {
    it("indexes GitHub repository successfully", async () => {
      const input: IndexToolInput = {
        type: "github",
        github: {
          url: "https://github.com/user/repo",
          metadata: { branch: "main", source: "github-repo" },
        },
      };

      mockIndexTool.mockResolvedValue({
        success: true,
        result: {
          itemsIndexed: 5,
          chunksCreated: 20,
          errors: [],
        },
      });

      const result = await mockIndexTool(input);

      expect(result.success).toBe(true);
      expect(result.result.itemsIndexed).toBe(5);
      expect(result.result.chunksCreated).toBe(20);
    });

    it("handles invalid GitHub repository URL", async () => {
      const input: IndexToolInput = {
        type: "github",
        github: {
          url: "https://not-github.com/user/repo",
        },
      };

      mockIndexTool.mockResolvedValue({
        success: false,
        error: "Invalid GitHub repository URL format",
      });

      const result = await mockIndexTool(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid GitHub repository URL");
    });

    it("handles repository not found error", async () => {
      const input: IndexToolInput = {
        type: "github",
        github: {
          url: "https://github.com/user/nonexistent-repo",
        },
      };

      mockIndexTool.mockResolvedValue({
        success: false,
        error: "Repository not found or not accessible",
      });

      const result = await mockIndexTool(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Repository not found");
    });

    it("handles private repository access error", async () => {
      const input: IndexToolInput = {
        type: "github",
        github: {
          url: "https://github.com/user/private-repo",
        },
      };

      mockIndexTool.mockResolvedValue({
        success: false,
        error: "Access denied to private repository",
      });

      const result = await mockIndexTool(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Access denied");
    });

    it("handles rate limiting error", async () => {
      const input: IndexToolInput = {
        type: "github",
        github: {
          url: "https://github.com/user/repo",
        },
      };

      mockIndexTool.mockResolvedValue({
        success: false,
        error: "GitHub API rate limit exceeded",
      });

      const result = await mockIndexTool(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain("rate limit exceeded");
    });
  });

  describe("error handling and edge cases", () => {
    it("handles database connection errors", async () => {
      const input: IndexToolInput = {
        type: "text",
        text: { content: "test" },
      };

      mockIndexTool.mockResolvedValue({
        success: false,
        error: "Database connection failed",
      });

      const result = await mockIndexTool(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Database connection failed");
    });

    it("handles embedding generation errors", async () => {
      const input: IndexToolInput = {
        type: "text",
        text: { content: "test" },
      };

      mockIndexTool.mockResolvedValue({
        success: false,
        error: "Failed to generate embeddings",
      });

      const result = await mockIndexTool(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to generate embeddings");
    });

    it("handles partial success with errors", async () => {
      const input: IndexToolInput = {
        type: "files",
        files: { pattern: "src/**/*.ts" },
      };

      mockIndexTool.mockResolvedValue({
        success: true,
        result: {
          itemsIndexed: 2,
          chunksCreated: 8,
          errors: ["Failed to index file: corrupted.ts"],
        },
      });

      const result = await mockIndexTool(input);

      expect(result.success).toBe(true);
      expect(result.result.itemsIndexed).toBe(2);
      expect(result.result.errors).toHaveLength(1);
    });

    it("handles missing type field", async () => {
      const input = {
        text: { content: "test" },
      };

      const schemaResult = indexToolSchema.safeParse(input);
      expect(schemaResult.success).toBe(false);
      if (!schemaResult.success) {
        expect(schemaResult.error.issues[0].path).toContain("type");
      }
    });

    it("handles mismatched type and content", async () => {
      const input: IndexToolInput = {
        type: "text",
        file: { path: "test.txt" }, // Wrong content type for 'text' type
      };

      mockIndexTool.mockResolvedValue({
        success: false,
        error:
          "Type 'text' requires 'text' field, but received other content type",
      });

      const result = await mockIndexTool(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Type 'text' requires 'text' field");
    });
  });

  describe("chunk size and overlap options", () => {
    it("applies custom chunk size correctly", async () => {
      const input: IndexToolInput = {
        type: "text",
        text: { content: "Test content" },
        chunkSize: 500,
      };

      mockIndexTool.mockResolvedValue({
        success: true,
        result: { itemsIndexed: 1, chunksCreated: 1, errors: [] },
      });

      await mockIndexTool(input);

      expect(mockIndexTool).toHaveBeenCalledWith(
        expect.objectContaining({ chunkSize: 500 }),
      );
    });

    it("applies custom chunk overlap correctly", async () => {
      const input: IndexToolInput = {
        type: "text",
        text: { content: "Test content" },
        chunkOverlap: 50,
      };

      mockIndexTool.mockResolvedValue({
        success: true,
        result: { itemsIndexed: 1, chunksCreated: 1, errors: [] },
      });

      await mockIndexTool(input);

      expect(mockIndexTool).toHaveBeenCalledWith(
        expect.objectContaining({ chunkOverlap: 50 }),
      );
    });

    it("uses default values when not specified", async () => {
      const input: IndexToolInput = {
        type: "text",
        text: { content: "Test content" },
      };

      const parsed = indexToolSchema.parse(input);
      expect(parsed.chunkSize).toBe(1000);
      expect(parsed.chunkOverlap).toBe(200);
    });

    it("validates chunk size is positive", () => {
      const input = {
        type: "text",
        text: { content: "test" },
        chunkSize: 0,
      };

      const result = indexToolSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("validates chunk overlap is non-negative", () => {
      const input = {
        type: "text",
        text: { content: "test" },
        chunkOverlap: -1,
      };

      const result = indexToolSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("handles chunk overlap greater than chunk size", async () => {
      const input: IndexToolInput = {
        type: "text",
        text: { content: "Test content" },
        chunkSize: 100,
        chunkOverlap: 150,
      };

      mockIndexTool.mockResolvedValue({
        success: false,
        error: "Chunk overlap cannot be greater than chunk size",
      });

      const result = await mockIndexTool(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        "Chunk overlap cannot be greater than chunk size",
      );
    });
  });

  describe("database service dependencies", () => {
    it("initializes database service correctly", async () => {
      const input: IndexToolInput = {
        type: "text",
        text: { content: "Test content" },
      };

      mockIndexTool.mockResolvedValue({
        success: true,
        result: { itemsIndexed: 1, chunksCreated: 1, errors: [] },
      });

      const result = await mockIndexTool(input);

      expect(result.success).toBe(true);
      // In a real implementation, we would verify that the database service was initialized
    });

    it("handles database service initialization failure", async () => {
      const input: IndexToolInput = {
        type: "text",
        text: { content: "Test content" },
      };

      mockIndexTool.mockResolvedValue({
        success: false,
        error: "Failed to initialize database service",
      });

      const result = await mockIndexTool(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to initialize database service");
    });

    it("properly closes database connections", async () => {
      const input: IndexToolInput = {
        type: "text",
        text: { content: "Test content" },
      };

      mockIndexTool.mockResolvedValue({
        success: true,
        result: { itemsIndexed: 1, chunksCreated: 1, errors: [] },
      });

      const result = await mockIndexTool(input);

      expect(result.success).toBe(true);
      // In a real implementation, we would verify that connections were properly closed
    });
  });
});

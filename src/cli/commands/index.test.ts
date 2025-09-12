import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleIndex } from "./index.js";

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

describe("handleIndex", () => {
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

  it("indexes text content", async () => {
    await handleIndex({
      values: {
        text: "Hello world",
        title: "Test",
      },
    });

    const { indexText } = await import("../../core/indexer/indexer.js");
    // TODO: The last two parameters are using expect.any(Object) which doesn't
    // verify the actual structure of the config and service objects being passed.
    // Consider adding more specific assertions for these parameters.
    expect(indexText).toHaveBeenCalledWith(
      "Hello world",
      { title: "Test", url: undefined, sourceType: "text" },
      expect.any(Object),
      expect.any(Object),
    );
    expect(console.log).toHaveBeenCalledWith("\nIndexing Results:");
    expect(console.log).toHaveBeenCalledWith("  Items indexed: 1");
    expect(console.log).toHaveBeenCalledWith("  Chunks created: 3");
  });

  it("indexes file content", async () => {
    await handleIndex({
      values: {
        file: "test.txt",
      },
    });

    const { indexFile } = await import("../../core/indexer/indexer.js");
    expect(indexFile).toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith("  Items indexed: 1");
    expect(console.log).toHaveBeenCalledWith("  Chunks created: 5");
  });

  it("indexes gist content", async () => {
    await handleIndex({
      values: {
        gist: "1234567890",
      },
    });

    const { indexGist } = await import("../../core/indexer/indexer.js");
    // TODO: Using expect.any(Object) for config and service parameters.
    // Consider verifying the actual structure of these objects.
    expect(indexGist).toHaveBeenCalledWith(
      "1234567890",
      expect.any(Object),
      expect.any(Object),
    );
    expect(console.log).toHaveBeenCalledWith("  Items indexed: 2");
    expect(console.log).toHaveBeenCalledWith("  Chunks created: 10");
  });

  it("indexes GitHub repository", async () => {
    await handleIndex({
      values: {
        github: "owner/repo",
        branch: "main",
      },
    });

    const { indexGitHubRepo } = await import("../../core/indexer/indexer.js");
    expect(indexGitHubRepo).toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith("  Items indexed: 5");
    expect(console.log).toHaveBeenCalledWith("  Chunks created: 20");
  });

  it.skip("handles file not found error", async () => {
    const { existsSync } = await import("node:fs");
    const securityModule = await import("../../core/security/security.js");
    const { validateFilePath } = securityModule;

    vi.mocked(validateFilePath).mockResolvedValueOnce(
      "/absolute/path/nonexistent.txt",
    );
    vi.mocked(existsSync).mockReturnValueOnce(false);

    await handleIndex({
      values: {
        file: "nonexistent.txt",
      },
    });

    expect(console.error).toHaveBeenCalledWith(
      "File not found: /absolute/path/nonexistent.txt",
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("handles security error", async () => {
    // Get the mocked modules
    const securityModule = await import("../../core/security/security.js");
    const { validateFilePath, SecurityError } = securityModule;

    // Create an instance that will pass instanceof check
    const error = new SecurityError("Invalid path", "code");

    // Mock validateFilePath to reject with SecurityError
    vi.mocked(validateFilePath).mockRejectedValueOnce(error);

    try {
      await handleIndex({
        values: {
          file: "../../../etc/passwd",
        },
      });
    } catch (_err) {
      // TODO: This catch block is intentionally swallowing errors because
      // process.exit is mocked and doesn't actually terminate the process.
      // Consider refactoring handleIndex to return error codes instead of
      // calling process.exit directly for better testability.
      // Should not throw, process.exit is mocked
    }

    expect(console.error).toHaveBeenCalledWith(
      "Error: Security error - File access is restricted to prevent unauthorized access: Invalid path",
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("shows error when no content specified", async () => {
    // process.exit prevents the rest of the function from executing
    await handleIndex({
      values: {},
    });

    expect(console.error).toHaveBeenCalledWith(
      "Error: No content specified. Use --text, --file, --files, --gist, or --github",
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  describe("preserve boundaries option", () => {
    it("respects --preserve-boundaries flag", async () => {
      await handleIndex({
        values: {
          text: "Hello world",
          "preserve-boundaries": true,
        },
      });

      const { indexText } = await import("../../core/indexer/indexer.js");
      expect(indexText).toHaveBeenCalledWith(
        "Hello world",
        expect.any(Object),
        expect.objectContaining({
          preserveBoundaries: true,
          chunkSize: 1000,
          chunkOverlap: 200,
        }),
        expect.any(Object),
      );
    });

    it("respects -p shorthand flag", async () => {
      // When using -p, gunshi will set preserve-boundaries to true
      await handleIndex({
        values: {
          text: "Hello world",
          "preserve-boundaries": true, // gunshi converts -p to preserve-boundaries
        },
      });

      const { indexText } = await import("../../core/indexer/indexer.js");
      expect(indexText).toHaveBeenCalledWith(
        "Hello world",
        expect.any(Object),
        expect.objectContaining({
          preserveBoundaries: true,
          chunkSize: 1000,
          chunkOverlap: 200,
        }),
        expect.any(Object),
      );
    });

    it("defaults preserveBoundaries to true when not specified", async () => {
      await handleIndex({
        values: {
          text: "Hello world",
        },
      });

      const { indexText } = await import("../../core/indexer/indexer.js");
      expect(indexText).toHaveBeenCalledWith(
        "Hello world",
        expect.any(Object),
        expect.objectContaining({
          preserveBoundaries: true,
          chunkSize: 1000,
          chunkOverlap: 200,
        }),
        expect.any(Object),
      );
    });
  });
});

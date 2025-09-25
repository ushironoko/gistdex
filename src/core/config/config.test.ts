import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createConfigOperations,
  type GistdexConfig,
} from "./config-operations.js";

// Mock fs module
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

describe("createConfigOperations", () => {
  let configOperations: ReturnType<typeof createConfigOperations>;

  beforeEach(() => {
    configOperations = createConfigOperations();
    vi.clearAllMocks();
    // Reset environment variables
    delete process.env.VECTOR_DB_PROVIDER;
    delete process.env.VECTOR_DB_PATH;
  });

  afterEach(() => {
    vi.clearAllMocks();
    configOperations.reset();
  });

  describe("load", () => {
    it("should load configuration from file", async () => {
      const mockConfig: GistdexConfig = {
        vectorDB: {
          provider: "sqlite",
          options: {
            path: "./test.db",
            dimension: 768,
          },
        },
        embedding: {
          model: "gemini-embedding-001",
          dimension: 768,
        },
      };

      vi.mocked(existsSync).mockImplementation((path) => {
        // Only return true for JSON config files, not TS/JS files
        return path === "./gistdex.config.json";
      });
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockConfig));

      const config = await configOperations.load();

      // defu merges with defaults, so check specific values
      expect(config.vectorDB?.provider).toBe(mockConfig.vectorDB?.provider);
      expect(config.vectorDB?.options?.path).toBe(
        mockConfig.vectorDB?.options?.path,
      );
      expect(config.embedding?.model).toBe(mockConfig.embedding?.model);
      expect(readFile).toHaveBeenCalledWith("./gistdex.config.json", "utf-8");
    });

    it("should return default config when file does not exist", async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const config = await configOperations.load();

      expect(config.vectorDB?.provider).toBe("sqlite");
      expect(config.vectorDB?.options?.path).toBe("./gistdex.db");
    });

    it("should not load configuration from environment variables", async () => {
      // Environment variables (except GOOGLE_GENERATIVE_AI_API_KEY) are no longer supported
      process.env.VECTOR_DB_PROVIDER = "memory";
      process.env.CHUNK_SIZE = "2000";

      vi.mocked(existsSync).mockReturnValue(false);

      const config = await configOperations.load();

      // Should use defaults, not environment variables
      expect(config.vectorDB?.provider).toBe("sqlite");
      // defu provides default values for all fields
      expect(config.indexing?.chunkSize).toBe(1000); // default value from config-merger
    });

    it("should load custom adapters configuration", async () => {
      const mockConfig: GistdexConfig = {
        vectorDB: {
          provider: "custom-provider",
          options: {
            dimension: 768,
          },
        },
        customAdapters: {
          "custom-provider": "./path/to/custom-adapter.js",
        },
      };

      vi.mocked(existsSync).mockImplementation((path) => {
        return path === "./gistdex.config.json";
      });
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockConfig));

      const config = await configOperations.load();

      expect(config.customAdapters).toEqual({
        "custom-provider": "./path/to/custom-adapter.js",
      });
    });
  });

  describe("save", () => {
    it("should save configuration to file", async () => {
      const config: GistdexConfig = {
        vectorDB: {
          provider: "sqlite",
          options: {
            path: "./test.db",
            dimension: 768,
          },
        },
      };

      await configOperations.save(config);

      expect(writeFile).toHaveBeenCalledWith(
        "gistdex.config.json",
        JSON.stringify(config, null, 2),
        "utf-8",
      );
    });

    it("should save custom adapters configuration", async () => {
      const config: GistdexConfig = {
        vectorDB: {
          provider: "custom-provider",
          options: {
            dimension: 768,
          },
        },
        customAdapters: {
          "custom-provider": "./path/to/custom-adapter.js",
        },
      };

      await configOperations.save(config);

      expect(writeFile).toHaveBeenCalledWith(
        "gistdex.config.json",
        JSON.stringify(config, null, 2),
        "utf-8",
      );
    });
  });

  describe("loadCustomAdapters", () => {
    it("should handle missing custom adapters gracefully", async () => {
      const mockConfig: GistdexConfig = {
        vectorDB: {
          provider: "sqlite",
          options: {
            path: "./test.db",
            dimension: 768,
          },
        },
      };

      const adapters = await configOperations.loadCustomAdapters(mockConfig);

      expect(adapters.size).toBe(0);
    });

    // Dynamic import tests are commented out as they don't work well in test environment
    // These would need integration tests instead
  });
});

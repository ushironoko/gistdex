import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFactory } from "./factory.js";
import { createRegistry } from "./registry.js";

// Mock node:sqlite to avoid actual database initialization in tests
vi.mock("node:sqlite", () => ({
  DatabaseSync: vi
    .fn()
    .mockImplementation((_path: string, _options?: unknown) => ({
      exec: vi.fn(),
      prepare: vi.fn().mockReturnValue({
        run: vi.fn(),
        get: vi.fn(),
        all: vi.fn().mockReturnValue([]),
      }),
      close: vi.fn(),
      loadExtension: vi.fn(),
    })),
}));

// Mock sqlite-vec
vi.mock("sqlite-vec", () => ({
  default: { load: vi.fn() },
  load: vi.fn(),
  getLoadablePath: vi.fn().mockReturnValue("/mock/path/to/sqlite-vec.so"),
}));

describe("createFactory", () => {
  let factory: ReturnType<typeof createFactory>;
  let registry: ReturnType<typeof createRegistry>;

  beforeEach(() => {
    registry = createRegistry();
    factory = createFactory(registry);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
  });

  describe("setDefaultConfig/getDefaultConfig", () => {
    it("should set and get default configuration", () => {
      const config = {
        provider: "memory",
        options: { dimension: 512 },
      };

      factory.setDefaultConfig(config);
      const retrieved = factory.getDefaultConfig();

      expect(retrieved).toEqual(config);
      expect(retrieved).not.toBe(config); // Should be a copy
    });
  });

  describe("create", () => {
    it("should create an adapter with default config", async () => {
      const adapter = await factory.create();

      expect(adapter).toBeDefined();
      expect(adapter.getInfo().provider).toBe("memory");
    });

    it("should merge partial config with defaults", async () => {
      factory.setDefaultConfig({
        provider: "memory",
        options: { dimension: 768, custom: "value" },
      });

      const adapter = await factory.create({
        options: { dimension: 512 },
      });

      expect(adapter).toBeDefined();
      // The dimension should be overridden, but custom should remain
    });

    it("should create new instances each time", async () => {
      const adapter1 = await factory.create({ provider: "memory" });
      const adapter2 = await factory.create({ provider: "memory" });

      expect(adapter1).not.toBe(adapter2);
    });
  });

  describe("createFromEnv", () => {
    it("should create adapter from environment variables", async () => {
      vi.stubEnv("VECTOR_DB_PROVIDER", "memory");
      vi.stubEnv("EMBEDDING_DIMENSION", "512");

      const adapter = await factory.createFromEnv();
      expect(adapter.getInfo().provider).toBe("memory");
    });

    it("should parse VECTOR_DB_CONFIG JSON", async () => {
      vi.stubEnv("VECTOR_DB_PROVIDER", "sqlite");
      vi.stubEnv("VECTOR_DB_CONFIG", JSON.stringify({ dimension: 256 }));

      const adapter = await factory.createFromEnv();
      expect(adapter).toBeDefined();
    });

    it("should handle invalid JSON gracefully", async () => {
      vi.stubEnv("VECTOR_DB_PROVIDER", "sqlite");
      vi.stubEnv("VECTOR_DB_CONFIG", "invalid json");

      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      const adapter = await factory.createFromEnv();
      expect(adapter).toBeDefined();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Failed to parse VECTOR_DB_CONFIG:",
        expect.any(Error),
      );

      consoleWarnSpy.mockRestore();
    });

    it("should use SQLite-specific env vars when provider is sqlite", async () => {
      vi.stubEnv("VECTOR_DB_PROVIDER", "sqlite");
      vi.stubEnv("SQLITE_DB_PATH", "test.db");
      vi.stubEnv("EMBEDDING_DIMENSION", "1024");

      const adapter = await factory.createFromEnv();
      expect(adapter.getInfo().provider).toBe("sqlite");
    });
  });
});

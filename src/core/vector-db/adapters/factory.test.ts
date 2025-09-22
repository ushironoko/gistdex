import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
  mock,
} from "bun:test";
import { createFactory } from "./factory.js";
import { createRegistry } from "./registry.js";

// Mock node:sqlite to avoid actual database initialization in tests
mock.module("node:sqlite", () => ({
  DatabaseSync: jest
    .fn()
    .mockImplementation((_path: string, _options?: unknown) => ({
      exec: jest.fn(),
      prepare: jest.fn().mockReturnValue({
        run: jest.fn(),
        get: jest.fn(),
        all: jest.fn().mockReturnValue([]),
      }),
      close: jest.fn(),
      loadExtension: jest.fn(),
    })),
}));

// Mock sqlite-vec
mock.module("sqlite-vec", () => ({
  default: { load: jest.fn() },
  load: jest.fn(),
  getLoadablePath: jest.fn().mockReturnValue("/mock/path/to/sqlite-vec.so"),
}));

describe("createFactory", () => {
  let factory: ReturnType<typeof createFactory>;
  let registry: ReturnType<typeof createRegistry>;

  beforeEach(() => {
    registry = createRegistry();
    factory = createFactory(registry);
  });

  afterEach(async () => {
    // Clean up environment variables
    delete process.env.VECTOR_DB_PROVIDER;
    delete process.env.EMBEDDING_DIMENSION;
    delete process.env.VECTOR_DB_CONFIG;
    delete process.env.SQLITE_DB_PATH;
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
      process.env.VECTOR_DB_PROVIDER = "memory";
      process.env.EMBEDDING_DIMENSION = "512";

      const adapter = await factory.createFromEnv();
      expect(adapter.getInfo().provider).toBe("memory");
    });

    it("should parse VECTOR_DB_CONFIG JSON", async () => {
      process.env.VECTOR_DB_PROVIDER = "sqlite";
      process.env.VECTOR_DB_CONFIG = JSON.stringify({ dimension: 256 });

      const adapter = await factory.createFromEnv();
      expect(adapter).toBeDefined();
    });

    it("should handle invalid JSON gracefully", async () => {
      process.env.VECTOR_DB_PROVIDER = "sqlite";
      process.env.VECTOR_DB_CONFIG = "invalid json";

      const consoleWarnSpy = jest
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
      process.env.VECTOR_DB_PROVIDER = "sqlite";
      process.env.SQLITE_DB_PATH = "test.db";
      process.env.EMBEDDING_DIMENSION = "1024";

      const adapter = await factory.createFromEnv();
      expect(adapter.getInfo().provider).toBe("sqlite");
    });
  });
});

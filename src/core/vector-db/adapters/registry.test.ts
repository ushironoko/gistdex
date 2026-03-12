import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryAdapter } from "./memory-adapter.js";
import { createRegistry } from "./registry.js";

// Mock SQLite to avoid actual database initialization in tests
vi.mock("node:sqlite", () => ({
  DatabaseSync: vi.fn().mockImplementation(function (
    this: Record<string, unknown>,
    _path: string,
    _options?: unknown,
  ) {
    this.exec = vi.fn();
    this.prepare = vi.fn().mockReturnValue({
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn().mockReturnValue([]),
    });
    this.close = vi.fn();
    this.loadExtension = vi.fn();
  }),
}));

// Mock sqlite-vec
vi.mock("sqlite-vec", () => ({
  default: { load: vi.fn() },
  load: vi.fn(),
  getLoadablePath: vi.fn().mockReturnValue("/mock/path/to/sqlite-vec.so"),
}));

describe("createRegistry", () => {
  let registry: ReturnType<typeof createRegistry>;

  beforeEach(() => {
    registry = createRegistry();
  });

  describe("register", () => {
    it("should register a new adapter factory", async () => {
      const mockFactory = () => createMemoryAdapter({ provider: "mock" });

      registry.register("mock", mockFactory);
      expect(await registry.hasProvider("mock")).toBe(true);
    });

    it("should throw error when registering duplicate provider", () => {
      const mockFactory = () => createMemoryAdapter({ provider: "mock" });

      registry.register("mock", mockFactory);
      expect(() => registry.register("mock", mockFactory)).toThrow(
        "Adapter already registered",
      );
    });
  });

  describe("get", () => {
    it("should get a registered adapter factory", async () => {
      const mockFactory = () => createMemoryAdapter({ provider: "mock" });

      registry.register("mock", mockFactory);
      const factory = await registry.get("mock");

      expect(factory).toBe(mockFactory);
    });

    it("should return undefined for unregistered provider", async () => {
      const factory = await registry.get("non-existent");
      expect(factory).toBeUndefined();
    });

    it("should have built-in memory adapter", async () => {
      const factory = await registry.get("memory");
      expect(factory).toBeDefined();
    });

    it("should have built-in sqlite adapter", async () => {
      const factory = await registry.get("sqlite");
      expect(factory).toBeDefined();
    });
  });

  describe("create", () => {
    it("should create an adapter instance", async () => {
      const adapter = await registry.create({
        provider: "memory",
        options: { dimension: 3 },
      });

      expect(adapter).toBeDefined();
      expect(adapter.getInfo().provider).toBe("memory");
    });

    it("should throw error for unregistered provider", async () => {
      await expect(
        registry.create({ provider: "non-existent" }),
      ).rejects.toThrow("No adapter registered");
    });
  });

  describe("listProviders", () => {
    it("should list all registered providers", async () => {
      const providers = await registry.listProviders();
      expect(providers).toContain("memory");
      expect(providers).toContain("sqlite");
    });

    it("should include custom registered providers", async () => {
      registry.register("custom", () =>
        createMemoryAdapter({ provider: "custom" }),
      );

      const providers = await registry.listProviders();
      expect(providers).toContain("custom");
      expect(providers).toContain("memory");
    });
  });

  describe("hasProvider", () => {
    it("should return true for registered provider", async () => {
      expect(await registry.hasProvider("memory")).toBe(true);
    });

    it("should return false for unregistered provider", async () => {
      expect(await registry.hasProvider("non-existent")).toBe(false);
    });
  });

  describe("unregister", () => {
    it("should unregister a provider", async () => {
      registry.register("temp", () =>
        createMemoryAdapter({ provider: "temp" }),
      );
      expect(await registry.hasProvider("temp")).toBe(true);

      const result = await registry.unregister("temp");
      expect(result).toBe(true);
      expect(await registry.hasProvider("temp")).toBe(false);
    });

    it("should return false when unregistering non-existent provider", async () => {
      const result = await registry.unregister("non-existent");
      expect(result).toBe(false);
    });
  });

  describe("clear", () => {
    it("should clear all registered adapters", async () => {
      registry.register("custom1", () =>
        createMemoryAdapter({ provider: "custom1" }),
      );
      registry.register("custom2", () =>
        createMemoryAdapter({ provider: "custom2" }),
      );

      registry.clear();

      // Built-in adapters should be re-registered on next access
      expect(await registry.hasProvider("memory")).toBe(true);
      expect(await registry.hasProvider("custom1")).toBe(false);
      expect(await registry.hasProvider("custom2")).toBe(false);
    });
  });
});

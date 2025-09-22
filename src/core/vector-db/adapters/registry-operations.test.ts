import { describe, expect, it, jest, mock } from "bun:test";
import {
  getDefaultRegistry,
  withCustomRegistry,
  withRegistry,
} from "./registry-operations.js";
import type { VectorDBAdapter, VectorDBConfig } from "./types.js";

// Mock node:sqlite to avoid import errors
mock.module("node:sqlite", () => ({
  DatabaseSync: jest.fn(),
}));

describe("registry-operations", () => {
  describe("withRegistry", () => {
    it("provides a registry with built-in adapters", async () => {
      const result = await withRegistry(async (registry) => {
        expect(await registry.hasProvider("memory")).toBe(true);
        expect(await registry.hasProvider("sqlite")).toBe(true);
        return "test-result";
      });

      expect(result).toBe("test-result");
    });

    it("creates adapter instances", async () => {
      await withRegistry(async (registry) => {
        const config: VectorDBConfig = {
          provider: "memory",
          options: { dimension: 3 },
        };

        const adapter = await registry.create(config);
        expect(adapter).toBeDefined();
        expect(adapter.initialize).toBeDefined();
      });
    });

    it("isolates registry instances", async () => {
      // First operation adds custom adapter
      await withRegistry(async (registry) => {
        const mockAdapter = (): VectorDBAdapter => ({
          initialize: jest.fn(),
          insert: jest.fn(),
          insertBatch: jest.fn(),
          search: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
          deleteBatch: jest.fn(),
          get: jest.fn(),
          count: jest.fn(),
          list: jest.fn(),
          close: jest.fn(),
          getInfo: jest.fn(),
        });

        registry.register("custom", mockAdapter);
        expect(await registry.hasProvider("custom")).toBe(true);
      });

      // Second operation should not see the custom adapter
      await withRegistry(async (registry) => {
        expect(await registry.hasProvider("custom")).toBe(false);
      });
    });
  });

  describe("withCustomRegistry", () => {
    it("allows custom adapter registration", async () => {
      const mockAdapter = (): VectorDBAdapter => ({
        initialize: jest.fn(),
        insert: jest.fn(),
        insertBatch: jest.fn(),
        search: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteBatch: jest.fn(),
        get: jest.fn(),
        count: jest.fn(),
        list: jest.fn(),
        close: jest.fn(),
        getInfo: jest.fn().mockReturnValue({
          provider: "custom",
          version: "1.0.0",
          capabilities: [],
        }),
      });

      const customAdapters = new Map([["custom", mockAdapter]]);

      const result = await withCustomRegistry(
        customAdapters,
        async (registry) => {
          expect(await registry.hasProvider("custom")).toBe(true);
          expect(await registry.hasProvider("memory")).toBe(true); // Built-ins still available

          const adapter = await registry.create({ provider: "custom" });
          const info = adapter.getInfo();
          expect(info.provider).toBe("custom");

          return "custom-result";
        },
      );

      expect(result).toBe("custom-result");
    });

    it("supports multiple custom adapters", async () => {
      const mockAdapter1 = (): VectorDBAdapter => ({
        initialize: jest.fn(),
        insert: jest.fn(),
        insertBatch: jest.fn(),
        search: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteBatch: jest.fn(),
        get: jest.fn(),
        count: jest.fn(),
        list: jest.fn(),
        close: jest.fn(),
        getInfo: jest.fn(),
      });

      const mockAdapter2 = (): VectorDBAdapter => ({
        initialize: jest.fn(),
        insert: jest.fn(),
        insertBatch: jest.fn(),
        search: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteBatch: jest.fn(),
        get: jest.fn(),
        count: jest.fn(),
        list: jest.fn(),
        close: jest.fn(),
        getInfo: jest.fn(),
      });

      const customAdapters = new Map([
        ["custom1", mockAdapter1],
        ["custom2", mockAdapter2],
      ]);

      await withCustomRegistry(customAdapters, async (registry) => {
        expect(await registry.hasProvider("custom1")).toBe(true);
        expect(await registry.hasProvider("custom2")).toBe(true);

        const providers = await registry.listProviders();
        expect(providers).toContain("custom1");
        expect(providers).toContain("custom2");
      });
    });
  });

  describe("getDefaultRegistry", () => {
    it("creates a registry with built-in adapters", async () => {
      const registry = getDefaultRegistry();

      expect(await registry.hasProvider("memory")).toBe(true);
      expect(await registry.hasProvider("sqlite")).toBe(true);
    });

    it("creates independent instances", async () => {
      const registry1 = getDefaultRegistry();
      const registry2 = getDefaultRegistry();

      // Add custom adapter to first registry
      const mockAdapter = (): VectorDBAdapter => ({
        initialize: jest.fn(),
        insert: jest.fn(),
        insertBatch: jest.fn(),
        search: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteBatch: jest.fn(),
        get: jest.fn(),
        count: jest.fn(),
        list: jest.fn(),
        close: jest.fn(),
        getInfo: jest.fn(),
      });

      registry1.register("custom", mockAdapter);

      // Second registry should not have the custom adapter
      expect(await registry1.hasProvider("custom")).toBe(true);
      expect(await registry2.hasProvider("custom")).toBe(false);
    });
  });
});

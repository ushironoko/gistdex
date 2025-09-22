import { beforeEach, describe, expect, jest, mock, test } from "bun:test";
import type { VectorDBConfig } from "../vector-db/adapters/types.js";
import {
  createDatabaseOperations,
  type DatabaseOperations,
} from "./database-operations.js";
import { createDatabaseService } from "./database-service.js";

// Mock node:sqlite to avoid import errors
mock.module("node:sqlite", () => ({
  DatabaseSync: jest.fn(),
}));

// Mock database-service
mock.module("./database-service.js", () => ({
  createDatabaseService: jest.fn(() => ({
    initialize: jest.fn(),
    close: jest.fn(),
    saveItem: jest.fn().mockResolvedValue("item-id"),
    searchItems: vi
      .fn()
      .mockResolvedValue([
        { id: "1", content: "test", score: 0.9, metadata: {} },
      ]),
    countItems: jest.fn().mockResolvedValue(5),
    listItems: jest.fn().mockResolvedValue([]),
    getStats: jest.fn().mockResolvedValue({
      totalItems: 5,
      bySourceType: {},
    }),
    getAdapterInfo: jest.fn().mockReturnValue({
      provider: "memory",
      version: "1.0.0",
      capabilities: [],
    }),
  })),
}));

describe("DatabaseOperations", () => {
  let operations: DatabaseOperations;
  const testConfig: VectorDBConfig = {
    provider: "memory",
    options: { dimension: 3 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    operations = createDatabaseOperations(testConfig);
  });

  describe("withDatabase", () => {
    test("initializes and closes database correctly", async () => {
      const mockCreateService = createDatabaseService as any;
      const result = await operations.withDatabase(async (_service) => {
        return "test-result";
      });

      expect(result).toBe("test-result");
      expect(mockCreateService).toHaveBeenCalled();
      const mockService = mockCreateService.mock.results[0]?.value;
      expect(mockService.initialize).toHaveBeenCalledWith(testConfig);
      expect(mockService.close).toHaveBeenCalled();
    });

    test("closes database even on error", async () => {
      const mockCreateService = createDatabaseService as any;

      await expect(
        operations.withDatabase(async () => {
          throw new Error("Test error");
        }),
      ).rejects.toThrow("Test error");

      const mockService = mockCreateService.mock.results[0]?.value;
      expect(mockService.close).toHaveBeenCalled();
    });

    test("provides working service instance", async () => {
      await operations.withDatabase(async (service) => {
        const itemId = await service.saveItem({
          content: "test",
          embedding: [0.1, 0.2, 0.3],
        });
        expect(itemId).toBe("item-id");

        const results = await service.searchItems({
          embedding: [0.1, 0.2, 0.3],
        });
        expect(results).toHaveLength(1);
      });
    });
  });

  describe("withReadOnly", () => {
    test("provides read-only operations", async () => {
      const result = await operations.withReadOnly(async (service) => {
        const count = await service.countItems();
        const items = await service.listItems();
        const stats = await service.getStats();

        return { count, items, stats };
      });

      expect(result.count).toBe(5);
      expect(result.items).toEqual([]);
      expect(result.stats.totalItems).toBe(5);
    });

    test("initializes and closes for read operations", async () => {
      const mockCreateService = createDatabaseService as any;

      await operations.withReadOnly(async () => {
        return "read-result";
      });

      const mockService = mockCreateService.mock.results[0]?.value;
      expect(mockService.initialize).toHaveBeenCalled();
      expect(mockService.close).toHaveBeenCalled();
    });
  });

  describe("withTransaction", () => {
    test("wraps operations in transaction scope", async () => {
      const mockCreateService = createDatabaseService as any;

      const result = await operations.withTransaction(async (service) => {
        await service.saveItem({
          content: "item1",
          embedding: [0.1, 0.2, 0.3],
        });
        await service.saveItem({
          content: "item2",
          embedding: [0.4, 0.5, 0.6],
        });
        return "transaction-complete";
      });

      expect(result).toBe("transaction-complete");
      const mockService = mockCreateService.mock.results[0]?.value;
      expect(mockService.initialize).toHaveBeenCalled();
      expect(mockService.close).toHaveBeenCalled();
    });

    test("rolls back on error", async () => {
      const mockCreateService = createDatabaseService as any;

      await expect(
        operations.withTransaction(async (service) => {
          await service.saveItem({
            content: "item1",
            embedding: [0.1, 0.2, 0.3],
          });
          throw new Error("Transaction error");
        }),
      ).rejects.toThrow("Transaction error");

      // Ensure cleanup happens
      const mockService = mockCreateService.mock.results[0]?.value;
      expect(mockService.close).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    test("wraps initialization errors", async () => {
      const mockCreateService = createDatabaseService as any;
      mockCreateService.mockImplementationOnce(() => ({
        initialize: jest.fn().mockRejectedValue(new Error("Init failed")),
        close: jest.fn(),
        saveItem: jest.fn(),
        saveItems: jest.fn(),
        searchItems: jest.fn(),
        countItems: jest.fn(),
        listItems: jest.fn(),
        getStats: jest.fn(),
        getAdapterInfo: jest.fn(),
      }));

      await expect(
        operations.withDatabase(async () => "should not reach"),
      ).rejects.toThrow("Init failed");
    });

    test("ensures cleanup on operation errors", async () => {
      const mockCreateService = createDatabaseService as any;
      let operationCalled = false;

      await expect(
        operations.withDatabase(async (service) => {
          operationCalled = true;
          await service.searchItems({ embedding: [1, 2, 3] });
          throw new Error("Operation failed");
        }),
      ).rejects.toThrow("Operation failed");

      expect(operationCalled).toBe(true);
      const mockService = mockCreateService.mock.results[0]?.value;
      expect(mockService.close).toHaveBeenCalled();
    });
  });

  describe("configuration", () => {
    test("uses provided configuration", async () => {
      const mockCreateService = createDatabaseService as any;
      const customConfig: VectorDBConfig = {
        provider: "sqlite",
        options: {
          path: "test.db",
          dimension: 768,
        },
      };

      const customOps = createDatabaseOperations(customConfig);
      await customOps.withDatabase(async () => "test");

      const mockService = mockCreateService.mock.results[0]?.value;
      expect(mockService.initialize).toHaveBeenCalledWith(customConfig);
    });

    test("works without configuration", async () => {
      const mockCreateService = createDatabaseService as any;
      const opsWithoutConfig = createDatabaseOperations();
      await opsWithoutConfig.withDatabase(async () => "test");

      const mockService = mockCreateService.mock.results[0]?.value;
      expect(mockService.initialize).toHaveBeenCalledWith(undefined);
    });
  });
});

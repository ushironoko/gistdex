import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
  type Mock,
  mock,
} from "bun:test";
import { handleList } from "./list.js";

// Mock node:sqlite to avoid import errors
mock.module("node:sqlite", () => ({
  DatabaseSync: jest.fn(),
}));

mock.module("../utils/config-helper.js", () => ({
  getDBConfig: jest.fn().mockResolvedValue({
    config: {
      provider: "sqlite",
      options: { path: "./test.db" },
    },
    customAdapters: new Map(),
  }),
}));

mock.module("../../core/database/database-service.js", () => ({
  databaseService: {
    initialize: jest.fn(),
    close: jest.fn(),
    getStats: jest.fn().mockResolvedValue({
      totalItems: 5,
      bySourceType: { text: 2, file: 3 },
    }),
    listItems: jest.fn().mockResolvedValue([
      {
        id: "12345678-abcd",
        metadata: {
          title: "Test Item",
          url: "https://example.com",
          sourceType: "text",
          createdAt: "2024-01-01",
        },
      },
    ]),
  },
  createDatabaseService: jest.fn(() => ({
    initialize: jest.fn(),
    close: jest.fn(),
    getStats: jest.fn().mockResolvedValue({
      totalItems: 5,
      bySourceType: { text: 2, file: 3 },
    }),
    listItems: jest.fn().mockResolvedValue([
      {
        id: "12345678-abcd",
        metadata: {
          title: "Test Item",
          url: "https://example.com",
          sourceType: "text",
          createdAt: "2024-01-01",
        },
      },
    ]),
    searchItems: jest.fn(),
    saveItem: jest.fn(),
    saveItems: jest.fn(),
    countItems: jest.fn(),
    getAdapterInfo: jest.fn(),
  })),
}));

describe("handleList", () => {
  const originalConsoleLog = console.log;

  beforeEach(() => {
    console.log = jest.fn();
    jest.clearAllMocks();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
  });

  it("lists items with stats", async () => {
    await handleList({
      values: {},
    });

    expect(console.log).toHaveBeenCalledWith("Database Provider: sqlite");
    expect(console.log).toHaveBeenCalledWith("Total chunks: 5");
    expect(console.log).toHaveBeenCalledWith("Unique sources: 1");
    expect(console.log).toHaveBeenCalledWith("\nChunks by source type:");
    expect(console.log).toHaveBeenCalledWith("  text: 2");
    expect(console.log).toHaveBeenCalledWith("  file: 3");
    expect(console.log).toHaveBeenCalledWith("\n=== Sources Summary ===");
  });

  it("shows stats only when flag is set", async () => {
    await handleList({
      values: {
        stats: true,
      },
    });

    expect(console.log).toHaveBeenCalledWith("Total chunks: 5");
    expect(console.log).toHaveBeenCalledWith("Unique sources: 1");
    expect(console.log).not.toHaveBeenCalledWith("\n=== Sources Summary ===");
  });

  it("handles empty database", async () => {
    const { createDatabaseService } = await import(
      "../../core/database/database-service.js"
    );
    (
      createDatabaseService as Mock<typeof createDatabaseService>
    ).mockImplementationOnce(() => ({
      initialize: jest.fn(),
      close: jest.fn(),
      getStats: jest.fn().mockResolvedValue({
        totalItems: 0,
        bySourceType: {},
      }),
      listItems: jest.fn().mockResolvedValue([]),
      searchItems: jest.fn(),
      saveItem: jest.fn(),
      saveItems: jest.fn(),
      countItems: jest.fn(),
      getAdapterInfo: jest.fn(),
    }));

    await handleList({
      values: {},
    });

    expect(console.log).toHaveBeenCalledWith("Total chunks: 0");
    expect(console.log).toHaveBeenCalledWith("Unique sources: 0");
    expect(console.log).not.toHaveBeenCalledWith("\nRecent items:");
  });
});

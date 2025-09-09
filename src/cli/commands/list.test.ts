import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleList } from "./list.js";

// Mock node:sqlite to avoid import errors
vi.mock("node:sqlite", () => ({
  DatabaseSync: vi.fn(),
}));

vi.mock("../utils/config-helper.js", () => ({
  getDBConfig: vi.fn().mockResolvedValue({
    config: {
      provider: "sqlite",
      options: { path: "./test.db" },
    },
    customAdapters: new Map(),
  }),
}));

vi.mock("../../core/database/database-service.js", () => ({
  databaseService: {
    initialize: vi.fn(),
    close: vi.fn(),
    getStats: vi.fn().mockResolvedValue({
      totalItems: 5,
      bySourceType: { text: 2, file: 3 },
    }),
    listItems: vi.fn().mockResolvedValue([
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
  createDatabaseService: vi.fn(() => ({
    initialize: vi.fn(),
    close: vi.fn(),
    getStats: vi.fn().mockResolvedValue({
      totalItems: 5,
      bySourceType: { text: 2, file: 3 },
    }),
    listItems: vi.fn().mockResolvedValue([
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
    searchItems: vi.fn(),
    saveItem: vi.fn(),
    saveItems: vi.fn(),
    countItems: vi.fn(),
    getAdapterInfo: vi.fn(),
  })),
}));

describe("handleList", () => {
  const originalConsoleLog = console.log;

  beforeEach(() => {
    console.log = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
  });

  it("lists items with stats", async () => {
    await handleList({
      values: {},
    });

    expect(console.log).toHaveBeenCalledWith("Database Provider: sqlite");
    expect(console.log).toHaveBeenCalledWith("Total items: 5");
    expect(console.log).toHaveBeenCalledWith("\nItems by source type:");
    expect(console.log).toHaveBeenCalledWith("  text: 2");
    expect(console.log).toHaveBeenCalledWith("  file: 3");
    expect(console.log).toHaveBeenCalledWith("\nRecent items:");
    expect(console.log).toHaveBeenCalledWith("  [12345678] Test Item");
  });

  it("shows stats only when flag is set", async () => {
    await handleList({
      values: {
        stats: true,
      },
    });

    expect(console.log).toHaveBeenCalledWith("Total items: 5");
    expect(console.log).not.toHaveBeenCalledWith("\nRecent items:");
  });

  it("handles empty database", async () => {
    const { createDatabaseService } = await import(
      "../../core/database/database-service.js"
    );
    vi.mocked(createDatabaseService).mockImplementationOnce(() => ({
      initialize: vi.fn(),
      close: vi.fn(),
      getStats: vi.fn().mockResolvedValue({
        totalItems: 0,
        bySourceType: {},
      }),
      listItems: vi.fn().mockResolvedValue([]),
      searchItems: vi.fn(),
      saveItem: vi.fn(),
      saveItems: vi.fn(),
      countItems: vi.fn(),
      getAdapterInfo: vi.fn(),
    }));

    await handleList({
      values: {},
    });

    expect(console.log).toHaveBeenCalledWith("Total items: 0");
    expect(console.log).not.toHaveBeenCalledWith("\nRecent items:");
  });
});

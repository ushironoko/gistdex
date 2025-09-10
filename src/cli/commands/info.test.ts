import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleInfo } from "./info.js";

// Mock node:sqlite to avoid import errors
vi.mock("node:sqlite", () => ({
  DatabaseSync: vi.fn(),
}));

vi.mock("../../core/database/database-service.js", () => ({
  databaseService: {
    initialize: vi.fn(),
    close: vi.fn(),
    getAdapterInfo: vi.fn().mockReturnValue({
      provider: "sqlite",
      version: "1.0.0",
      capabilities: ["vector-search", "hybrid-search"],
    }),
  },
  createDatabaseService: vi.fn(() => ({
    initialize: vi.fn(),
    close: vi.fn(),
    getAdapterInfo: vi.fn().mockReturnValue({
      provider: "sqlite",
      version: "1.0.0",
      capabilities: ["vector-search", "hybrid-search"],
    }),
    searchItems: vi.fn(),
    saveItem: vi.fn(),
    saveItems: vi.fn(),
    countItems: vi.fn(),
    listItems: vi.fn(),
    getStats: vi.fn(),
  })),
}));

describe("handleInfo", () => {
  const originalConsoleLog = console.log;

  beforeEach(() => {
    console.log = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
  });

  it("displays adapter information", async () => {
    await handleInfo({ values: {} });

    expect(console.log).toHaveBeenCalledWith("Database Adapter Information:");
    expect(console.log).toHaveBeenCalledWith("  Provider: sqlite");
    expect(console.log).toHaveBeenCalledWith("  Version: 1.0.0");
    expect(console.log).toHaveBeenCalledWith("  Capabilities:");
    expect(console.log).toHaveBeenCalledWith("    - vector-search");
    expect(console.log).toHaveBeenCalledWith("    - hybrid-search");
  });

  it("handles missing adapter info", async () => {
    const { createDatabaseService } = await import(
      "../../core/database/database-service.js"
    );
    vi.mocked(createDatabaseService).mockImplementationOnce(() => ({
      initialize: vi.fn(),
      close: vi.fn(),
      getAdapterInfo: vi.fn().mockReturnValue(null),
      searchItems: vi.fn(),
      saveItem: vi.fn(),
      saveItems: vi.fn(),
      countItems: vi.fn(),
      listItems: vi.fn(),
      getStats: vi.fn(),
    }));

    await handleInfo({ values: {} });

    expect(console.log).toHaveBeenCalledWith(
      "No adapter information available",
    );
  });
});

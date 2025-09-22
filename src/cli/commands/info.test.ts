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
import { handleInfo } from "./info.js";

// Mock node:sqlite to avoid import errors
mock.module("node:sqlite", () => ({
  DatabaseSync: jest.fn(),
}));

mock.module("../../core/database/database-service.js", () => ({
  databaseService: {
    initialize: jest.fn(),
    close: jest.fn(),
    getAdapterInfo: jest.fn().mockReturnValue({
      provider: "sqlite",
      version: "1.0.0",
      capabilities: ["vector-search", "hybrid-search"],
    }),
  },
  createDatabaseService: jest.fn(() => ({
    initialize: jest.fn(),
    close: jest.fn(),
    getAdapterInfo: jest.fn().mockReturnValue({
      provider: "sqlite",
      version: "1.0.0",
      capabilities: ["vector-search", "hybrid-search"],
    }),
    searchItems: jest.fn(),
    saveItem: jest.fn(),
    saveItems: jest.fn(),
    countItems: jest.fn(),
    listItems: jest.fn(),
    getStats: jest.fn(),
  })),
}));

describe("handleInfo", () => {
  const originalConsoleLog = console.log;

  beforeEach(() => {
    console.log = jest.fn();
    jest.clearAllMocks();
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
    (
      createDatabaseService as Mock<typeof createDatabaseService>
    ).mockImplementationOnce(() => ({
      initialize: jest.fn(),
      close: jest.fn(),
      getAdapterInfo: jest.fn().mockReturnValue(null),
      searchItems: jest.fn(),
      saveItem: jest.fn(),
      saveItems: jest.fn(),
      countItems: jest.fn(),
      listItems: jest.fn(),
      getStats: jest.fn(),
    }));

    await handleInfo({ values: {} });

    expect(console.log).toHaveBeenCalledWith(
      "No adapter information available",
    );
  });
});

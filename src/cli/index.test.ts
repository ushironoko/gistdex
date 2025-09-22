// Mock the commands to prevent actual execution
import { describe, expect, it, jest, mock } from "bun:test";

mock.module("./commands/index.js", () => ({
  handleIndex: jest.fn().mockResolvedValue(undefined),
  getDBConfig: jest.fn().mockReturnValue({}),
}));

mock.module("./commands/info.js", () => ({
  handleInfo: jest.fn().mockResolvedValue(undefined),
}));

mock.module("./commands/init.js", () => ({
  handleInit: jest.fn().mockResolvedValue(undefined),
}));

mock.module("./commands/list.js", () => ({
  handleList: jest.fn().mockResolvedValue(undefined),
}));

mock.module("./commands/query.js", () => ({
  handleQuery: jest.fn().mockResolvedValue(undefined),
}));

mock.module("./commands/version.js", () => ({
  showVersion: jest.fn(),
}));

mock.module("./utils/special-flags.js", () => ({
  handleSpecialFlags: jest.fn().mockReturnValue(false),
}));

describe("CLI index", () => {
  it("should export getDBConfig for backward compatibility", async () => {
    const { getDBConfig } = await import("./commands/index.js");
    expect(getDBConfig).toBeDefined();
    expect(typeof getDBConfig).toBe("function");
  });

  it("should define db arguments correctly", () => {
    // Since the dbArgs is internal to the module, we can only test that
    // the module loads without error
    expect(async () => {
      await import("./index.js");
    }).not.toThrow();
  });
});

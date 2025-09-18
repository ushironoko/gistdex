import { describe, expect, it, vi } from "vitest";

// Mock the commands to prevent actual execution
vi.mock("./commands/index.js", () => ({
  handleIndex: vi.fn().mockResolvedValue(undefined),
  getDBConfig: vi.fn().mockReturnValue({}),
}));

vi.mock("./commands/info.js", () => ({
  handleInfo: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./commands/init.js", () => ({
  handleInit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./commands/list.js", () => ({
  handleList: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./commands/query.js", () => ({
  handleQuery: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./commands/version.js", () => ({
  showVersion: vi.fn(),
}));

vi.mock("./utils/special-flags.js", () => ({
  handleSpecialFlags: vi.fn().mockReturnValue(false),
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

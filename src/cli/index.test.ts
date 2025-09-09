import type { SpyInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "./index.js";

// Mock command handlers
vi.mock("./commands/init.js", () => ({
  handleInit: vi.fn(() => Promise.resolve()),
}));

vi.mock("./commands/help.js", () => ({
  showHelp: vi.fn(),
}));

vi.mock("./commands/version.js", () => ({
  showVersion: vi.fn(),
}));

vi.mock("./commands/index.js", () => ({
  handleIndex: vi.fn(() => Promise.resolve()),
}));

vi.mock("./commands/query.js", () => ({
  handleQuery: vi.fn(() => Promise.resolve()),
}));

vi.mock("./commands/list.js", () => ({
  handleList: vi.fn(() => Promise.resolve()),
}));

vi.mock("./commands/info.js", () => ({
  handleInfo: vi.fn(() => Promise.resolve()),
}));

// Mock gunshi
vi.mock("gunshi", () => ({
  cli: vi.fn(() => Promise.resolve()),
  define: vi.fn((command: unknown) => command),
}));

describe("CLI main entry point", () => {
  let originalArgv: string[];
  let mockExit: SpyInstance;
  let mockConsoleError: SpyInstance;

  beforeEach(() => {
    originalArgv = process.argv;
    mockExit = vi
      .spyOn(process, "exit")
      .mockImplementation((code?: string | number | null | undefined) => {
        // Don't throw error for code 0 (normal exit)
        if (code !== 0) {
          throw new Error(`Process exited with code ${code}`);
        }
      });
    mockConsoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.argv = originalArgv;
    mockExit.mockRestore();
    mockConsoleError.mockRestore();
  });

  it("should let gunshi handle help when no arguments are provided", async () => {
    const { cli } = await import("gunshi");
    process.argv = ["node", "cli.js"];

    await main();
    // Gunshi's cli function should be called to handle help
    expect(cli).toHaveBeenCalled();
  });

  it("should let gunshi handle help with --help flag", async () => {
    const { cli } = await import("gunshi");
    process.argv = ["node", "cli.js", "--help"];

    await main();
    // Gunshi's cli function should be called to handle help
    expect(cli).toHaveBeenCalled();
  });

  it("should show version with --version flag", async () => {
    const { showVersion } = await import("./commands/version.js");
    process.argv = ["node", "cli.js", "--version"];

    await main();
    expect(showVersion).toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it("should show version with -v flag", async () => {
    const { showVersion } = await import("./commands/version.js");
    process.argv = ["node", "cli.js", "-v"];

    await main();
    expect(showVersion).toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it("should handle version command", async () => {
    const { cli } = await import("gunshi");
    process.argv = ["node", "cli.js", "version"];

    await main();
    expect(cli).toHaveBeenCalled();
  });

  it("should handle init command", async () => {
    const { cli } = await import("gunshi");
    process.argv = ["node", "cli.js", "init"];

    await main();
    expect(cli).toHaveBeenCalled();
  });

  it("should handle --init alias", async () => {
    const { cli } = await import("gunshi");
    process.argv = ["node", "cli.js", "--init"];

    await main();
    expect(cli).toHaveBeenCalled();
  });

  it("should handle unknown command", async () => {
    const { cli } = await import("gunshi");
    process.argv = ["node", "cli.js", "unknown"];

    // gunshi handles unknown commands internally
    await main();

    // Verify that cli was called with the unknown command
    // gunshi will handle the error internally
    expect(cli).toHaveBeenCalled();
  });

  it("should call gunshi cli for valid commands", async () => {
    const { cli } = await import("gunshi");
    process.argv = ["node", "cli.js", "list"];

    await main();
    expect(cli).toHaveBeenCalled();
  });
});

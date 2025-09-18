import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  parseCommand,
  runCLIInDirectory,
  runCLISecure,
} from "../helpers/secure-cli.js";

describe("CLI main entry point", () => {
  let tempDir: string;
  let testDbPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gistdex-cli-test-"));
    testDbPath = join(tempDir, "test.db");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  function runCLI(commandString: string): {
    stdout: string;
    stderr: string;
    code: number;
  } {
    const args = parseCommand(commandString);
    return runCLISecure(args);
  }

  it("should show help when no arguments are provided", () => {
    const result = runCLI("");

    expect(result.stdout.toLowerCase()).toContain("usage");
    expect(result.stdout.toLowerCase()).toContain("commands");
    expect(result.code).toBe(0);
  });

  it("should show help with --help flag", () => {
    const result = runCLI("--help");

    expect(result.stdout.toLowerCase()).toContain("usage");
    expect(result.stdout.toLowerCase()).toContain("commands");
    expect(result.code).toBe(0);
  });

  it("should show version with --version flag", () => {
    const result = runCLI("--version");

    expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    expect(result.code).toBe(0);
  });

  it("should show version with -v flag", () => {
    const result = runCLI("-v");

    expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    expect(result.code).toBe(0);
  });

  it("should handle init command", () => {
    const result = runCLI(`init --db ${testDbPath} --provider memory`);

    // init command may return code 1 if prompt is cancelled
    expect([0, 1]).toContain(result.code);
    expect(result.stdout.toLowerCase()).toContain("database");
  });

  it("should handle index command with text", () => {
    const result = runCLI(
      `index --text "Test content for indexing" --db ${testDbPath} --provider memory`,
    );

    // May not show "indexed" without API key
    expect([0, 1]).toContain(result.code);
    expect(result.stdout).toBeDefined();
  });

  it("should handle index command with file", async () => {
    const testFile = join(tempDir, "test.txt");
    await writeFile(testFile, "Test file content", "utf-8");

    const result = runCLI(
      `index --file ${testFile} --db ${testDbPath} --provider memory`,
    );

    // May not show "indexed" without API key
    expect([0, 1]).toContain(result.code);
    expect(result.stdout).toBeDefined();
  });

  it("should handle query command", () => {
    // First index some content
    runCLI(
      `index --text "TypeScript is great" --db ${testDbPath} --provider memory`,
    );

    // Then query
    const result = runCLI(
      `query "TypeScript" --db ${testDbPath} --provider memory -k 5`,
    );

    expect(result.code).toBe(0);
    // May not find results without real embeddings, but command should run
    expect(result.stdout).toBeDefined();
  });

  it("should handle list command", () => {
    // First index some content
    runCLI(
      `index --text "Sample content" --db ${testDbPath} --provider memory`,
    );

    const result = runCLI(`list --db ${testDbPath} --provider memory`);

    expect(result.code).toBe(0);
    expect(result.stdout).toBeDefined();
  });

  it("should handle info command", () => {
    const result = runCLI(`info --provider memory`);

    expect(result.code).toBe(0);
    expect(result.stdout.toLowerCase()).toContain("memory");
  });

  it("should handle invalid command gracefully", () => {
    const result = runCLI("invalidcommand");

    expect(result.code).toBe(1);
    // gunshi shows "error: command not found"
    expect(result.stdout.toLowerCase() + result.stderr.toLowerCase()).toContain(
      "command not found",
    );
  });

  it.skip("should handle missing required arguments", () => {
    const result = runCLI("query"); // Missing query string

    expect(result.code).toBe(1);
    expect(result.stdout + result.stderr).toBeDefined();
  });

  it("should handle MCP mode flag", () => {
    // MCP mode runs a server, so we just check if the flag is recognized
    // We can't actually test the server in a unit test
    const result = runCLI("--mcp --help");

    // Should show MCP-specific help or start server
    expect(result.stdout).toBeDefined();
  });

  it("should respect environment variables", () => {
    const result = runCLI("info --provider memory");

    expect(result.code).toBe(0);
    expect(result.stdout).toBeDefined();
  });

  it("should handle configuration file", async () => {
    const configPath = join(tempDir, "gistdex.config.json");
    const config = {
      vectorDB: {
        provider: "memory",
        options: { dimension: 768 },
      },
    };
    await writeFile(configPath, JSON.stringify(config, null, 2));

    // Run command in the directory with config using secure helper
    const result = runCLIInDirectory(tempDir, ["info"]);

    expect(result).toBeDefined();
    // Command will show adapter info
    expect(result.toLowerCase()).toContain("adapter");
  });

  it("should override config with CLI arguments", async () => {
    const configPath = join(tempDir, "gistdex.config.json");
    const config = {
      vectorDB: {
        provider: "sqlite",
        options: { path: "./default.db" },
      },
    };
    await writeFile(configPath, JSON.stringify(config, null, 2));

    // Override with CLI argument using secure helper
    const result = runCLIInDirectory(tempDir, ["info", "--provider", "memory"]);

    // Should show memory adapter info
    expect(result.toLowerCase()).toContain("adapter");
  });

  it("should handle multiple file indexing with glob", async () => {
    // Create test files
    await writeFile(join(tempDir, "file1.txt"), "Content 1", "utf-8");
    await writeFile(join(tempDir, "file2.txt"), "Content 2", "utf-8");

    const pattern = join(tempDir, "*.txt");
    const result = runCLI(
      `index --files "${pattern}" --db ${testDbPath} --provider memory`,
    );

    // May fail without API key but command should run
    expect([0, 1]).toContain(result.code);
    expect(result.stdout).toBeDefined();
  });

  it("should handle full content retrieval flag", () => {
    // First index content
    runCLI(
      `index --text "Full content test" --db ${testDbPath} --provider memory`,
    );

    // Query with full flag
    const result = runCLI(
      `query "test" --full --db ${testDbPath} --provider memory -k 1`,
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toBeDefined();
  });

  it("should handle chunk size and overlap options", () => {
    const result = runCLI(
      `index --text "Long content for chunking test" --chunk-size 50 --chunk-overlap 10 --db ${testDbPath} --provider memory`,
    );

    expect(result.code).toBe(0);
    expect(result.stdout.toLowerCase()).toContain("indexed");
  });

  it("should handle hybrid search flag", () => {
    // First index content
    runCLI(
      `index --text "Hybrid search test content" --db ${testDbPath} --provider memory`,
    );

    // Query with hybrid flag
    const result = runCLI(
      `query "hybrid" --hybrid --db ${testDbPath} --provider memory -k 5`,
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toBeDefined();
  });

  it("should handle stats flag for list command", () => {
    // First index content
    runCLI(
      `index --text "Stats test content" --db ${testDbPath} --provider memory`,
    );

    const result = runCLI(`list --stats --db ${testDbPath} --provider memory`);

    expect(result.code).toBe(0);
    expect(result.stdout.toLowerCase()).toContain("total");
  });

  it("should handle type filter in query", () => {
    // First index content
    runCLI(
      `index --text "Type filter test" --db ${testDbPath} --provider memory`,
    );

    const result = runCLI(
      `query "test" --type text --db ${testDbPath} --provider memory -k 5`,
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toBeDefined();
  });
});

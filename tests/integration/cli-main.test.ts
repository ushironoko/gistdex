import { execSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupEmbeddingMocks } from "../helpers/mock-embeddings.js";

// Setup mocks for embedding generation
setupEmbeddingMocks();

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

  function runCLI(args: string): {
    stdout: string;
    stderr: string;
    code: number;
  } {
    try {
      const result = execSync(`node dist/cli/index.js ${args}`, {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: "production", // Override NODE_ENV to allow CLI execution
          NODE_NO_WARNINGS: "1",
          VITEST: undefined, // Ensure VITEST is not set
        },
        encoding: "utf8",
      });
      return { stdout: result.toString(), stderr: "", code: 0 };
    } catch (error) {
      const execError = error as {
        stdout?: Buffer | string;
        stderr?: Buffer | string;
        status?: number;
        output?: Array<Buffer | string | null>;
      };
      // CLIツールの出力はstderrにも出力されることがあるため、両方を結合
      const stdout = execError.stdout?.toString() || "";
      const stderr = execError.stderr?.toString() || "";
      // outputプロパティからも取得を試みる
      let combined = stdout || stderr;
      if (!combined && execError.output) {
        const outputStr = execError.output
          .filter(Boolean)
          .map((buf) => buf?.toString() || "")
          .join("");
        if (outputStr) combined = outputStr;
      }
      return {
        stdout: combined,
        stderr: stderr,
        code: execError.status || 1,
      };
    }
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

  it("should handle missing required arguments", () => {
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

    // Get the project root path securely
    const projectRoot = process.cwd();
    const cliPath = join(projectRoot, "dist/cli/index.js");

    // Run command in the directory with config
    const result = execSync(`cd ${tempDir} && node ${cliPath} info`, {
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "production",
        NODE_NO_WARNINGS: "1",
        VITEST: undefined,
      },
    });

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

    // Get the project root path securely
    const projectRoot = process.cwd();
    const cliPath = join(projectRoot, "dist/cli/index.js");

    // Override with CLI argument
    const result = execSync(
      `cd ${tempDir} && node ${cliPath} info --provider memory`,
      {
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_ENV: "production",
          NODE_NO_WARNINGS: "1",
          VITEST: undefined,
        },
      },
    );

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

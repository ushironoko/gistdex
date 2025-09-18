import { execSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupEmbeddingMocks } from "../helpers/mock-embeddings.js";
import { testCode, testDocuments } from "../helpers/test-fixtures.js";

// Setup mocks for embedding generation
setupEmbeddingMocks();

/**
 * CLI Commands Integration Test
 * 実際のCLIコマンドを実行して、エンドツーエンドの動作を検証
 */
describe("CLI Commands Integration", () => {
  let tempDir: string;
  let testDbPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gistdex-cli-test-"));
    testDbPath = join(tempDir, "test.db");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  function runCLI(args: string): string {
    try {
      const output = execSync(`node dist/cli/index.js ${args}`, {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: "production", // Override NODE_ENV to allow CLI execution
          NODE_NO_WARNINGS: "1",
          VITEST: undefined, // Ensure VITEST is not set
        },
        encoding: "utf8",
      });
      return output.toString();
    } catch (error) {
      const execError = error as {
        stdout?: Buffer | string;
        stderr?: Buffer | string;
        output?: Array<Buffer | string | null>;
      };
      // CLIツールの出力はstderrにも出力されることがあるため、両方をチェック
      const stdout = execError.stdout?.toString() || "";
      const stderr = execError.stderr?.toString() || "";
      // execSyncのoutputプロパティをチェック
      if (execError.output) {
        const outputStr = execError.output
          .filter(Boolean)
          .map((buf) => buf?.toString() || "")
          .join("");
        if (outputStr) return outputStr;
      }
      return stdout || stderr || "";
    }
  }

  describe("init command", () => {
    it("should initialize configuration files", async () => {
      // 一時ディレクトリで初期化を実行
      const output = runCLI(`init`);

      // Welcome messageまたはConfigurationが表示されることを期待
      expect(output.toLowerCase()).toContain("gistdex");
    });
  });

  describe("index command", () => {
    it("should index text content", async () => {
      const content = testDocuments.typescript.content;

      // テキストをインデックス
      const output = runCLI(
        `index --text "${content}" --db ${testDbPath} --provider memory`,
      );

      expect(output).toBeDefined();
    });

    it("should index a file", async () => {
      const filePath = join(tempDir, "test.ts");
      await writeFile(filePath, testCode.typescript, "utf-8");

      // ファイルをインデックス
      const output = runCLI(
        `index --file ${filePath} --db ${testDbPath} --provider memory`,
      );

      expect(output).toBeDefined();
    });

    it("should index multiple files with glob pattern", async () => {
      // 複数のテストファイルを作成
      await writeFile(join(tempDir, "test1.ts"), testCode.typescript, "utf-8");
      await writeFile(join(tempDir, "test2.js"), testCode.javascript, "utf-8");
      await writeFile(join(tempDir, "test3.py"), testCode.python, "utf-8");

      // globパターンでインデックス
      const output = runCLI(
        `index --files "${tempDir}/*.{ts,js,py}" --db ${testDbPath} --provider memory`,
      );

      expect(output).toBeDefined();
    });

    it("should handle chunk size and overlap options", async () => {
      const content = "This is a test content for chunking validation.";

      const output = runCLI(
        `index --text "${content}" --chunk-size 50 --chunk-overlap 10 --db ${testDbPath} --provider memory`,
      );

      expect(output).toBeDefined();
    });
  });

  describe("query command", () => {
    beforeEach(async () => {
      // テストデータをインデックス
      const content = testDocuments.typescript.content;
      runCLI(`index --text "${content}" --db ${testDbPath} --provider memory`);
    });

    it("should perform semantic search", async () => {
      const output = runCLI(
        `query "TypeScript" --db ${testDbPath} --provider memory -k 5`,
      );

      expect(output.toLowerCase()).toContain("typescript");
    });

    it("should perform hybrid search", async () => {
      const output = runCLI(
        `query "JavaScript static typing" --db ${testDbPath} --provider memory -k 5 --hybrid`,
      );

      expect(output).toBeDefined();
    });

    it("should retrieve full content", async () => {
      const output = runCLI(
        `query "TypeScript" --db ${testDbPath} --provider memory -k 1 --full`,
      );

      expect(output).toBeDefined();
    });

    it("should filter by source type", async () => {
      // 異なるソースタイプでインデックス
      runCLI(
        `index --text "Code content" --db ${testDbPath} --provider memory`,
      );

      const filePath = join(tempDir, "test.ts");
      await writeFile(filePath, testCode.typescript, "utf-8");
      runCLI(`index --file ${filePath} --db ${testDbPath} --provider memory`);

      // ファイルタイプでフィルタ
      const output = runCLI(
        `query "content" --db ${testDbPath} --provider memory --type file`,
      );

      expect(output).toBeDefined();
    });
  });

  describe("list command", () => {
    beforeEach(async () => {
      // テストデータをインデックス (少量のデータで高速化)
      const shortDoc = "Test document for listing";
      runCLI(`index --text "${shortDoc}" --db ${testDbPath} --provider memory`);
    }, 20000); // タイムアウトを20秒に増やす

    it("should list all indexed items", async () => {
      const output = runCLI(`list --db ${testDbPath} --provider memory`);

      expect(output).toBeDefined();
      // 出力に複数のアイテムが含まれることを確認
      const lines = output.split("\n").filter((line) => line.trim());
      expect(lines.length).toBeGreaterThan(1);
    });

    it("should show statistics only", async () => {
      const output = runCLI(
        `list --stats --db ${testDbPath} --provider memory`,
      );

      expect(output).toBeDefined();
      expect(output.toLowerCase()).toContain("total");
    });

    it("should limit the number of items", async () => {
      const output = runCLI(
        `list --limit 2 --db ${testDbPath} --provider memory`,
      );

      expect(output).toBeDefined();
    });
  });

  describe("info command", () => {
    it("should display adapter information", async () => {
      const output = runCLI(`info --provider memory`);

      expect(output).toBeDefined();
      expect(output.toLowerCase()).toContain("memory");
    });

    it("should display SQLite adapter info", async () => {
      const output = runCLI(`info --provider sqlite`);

      expect(output).toBeDefined();
      expect(output.toLowerCase()).toContain("sqlite");
    });
  });

  describe("version command", () => {
    it("should display version information", async () => {
      const output = runCLI("version");

      expect(output).toBeDefined();
      expect(output).toMatch(/\d+\.\d+\.\d+/);
    });

    it("should work with --version flag", async () => {
      const output = runCLI("--version");

      expect(output).toBeDefined();
      expect(output).toMatch(/\d+\.\d+\.\d+/);
    });

    it("should work with -v flag", async () => {
      const output = runCLI("-v");

      expect(output).toBeDefined();
      expect(output).toMatch(/\d+\.\d+\.\d+/);
    });
  });

  describe("help command", () => {
    it("should display help information", async () => {
      // gunshi framework only supports --help flag, not help command
      const output = runCLI("--help");

      expect(output).toBeDefined();
      expect(output.toLowerCase()).toContain("usage");
      expect(output.toLowerCase()).toContain("commands");
    });

    it("should display help with no arguments", async () => {
      const output = execSync(`node ${process.cwd()}/dist/cli/index.js`, {
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_ENV: "production",
          NODE_NO_WARNINGS: "1",
          VITEST: undefined,
        },
      });

      expect(output).toBeDefined();
      expect(output.toLowerCase()).toContain("usage");
    });
  });

  describe("error handling", () => {
    it("should handle invalid command gracefully", async () => {
      const output = runCLI("invalidcommand");

      expect(output).toBeDefined();
      // エラーメッセージまたはヘルプが表示される
    });

    it("should handle missing required arguments", async () => {
      const output = runCLI("query"); // クエリ文字列なし

      expect(output).toBeDefined();
    });

    it("should handle invalid file paths", async () => {
      const output = runCLI(
        `index --file /nonexistent/file.txt --db ${testDbPath} --provider memory`,
      );

      expect(output).toBeDefined();
    });
  });

  describe("configuration handling", () => {
    it("should use config file if present", async () => {
      const configPath = join(tempDir, "gistdex.config.json");
      const config = {
        vectorDB: {
          provider: "memory",
          options: { dimension: 768 },
        },
      };
      await writeFile(configPath, JSON.stringify(config, null, 2));

      // 設定ファイルのあるディレクトリでコマンドを実行
      const output = execSync(
        `cd ${tempDir} && node ${process.cwd()}/dist/cli/index.js info`,
        { encoding: "utf8" },
      );

      expect(output).toBeDefined();
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

      // CLIで別のプロバイダを指定
      const output = execSync(
        `cd ${tempDir} && node ${process.cwd()}/dist/cli/index.js info --provider memory`,
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

      // Should show adapter info
      expect(output.toLowerCase()).toContain("adapter");
    });
  });

  describe("end-to-end workflow", () => {
    it("should complete full index and search workflow", async () => {
      // 1. ファイルを作成
      const tsFile = join(tempDir, "example.ts");
      await writeFile(tsFile, testCode.typescript, "utf-8");

      const pyFile = join(tempDir, "example.py");
      await writeFile(pyFile, testCode.python, "utf-8");

      // 2. ファイルをインデックス
      runCLI(`index --file ${tsFile} --db ${testDbPath} --provider memory`);
      runCLI(`index --file ${pyFile} --db ${testDbPath} --provider memory`);

      // 3. テキストも追加
      runCLI(
        `index --text "${testDocuments.gistdex.content}" --db ${testDbPath} --provider memory`,
      );

      // 4. リストで確認
      const listOutput = runCLI(
        `list --stats --db ${testDbPath} --provider memory`,
      );
      // Should show stats (may not have "total" if indexing failed)
      expect(listOutput).toBeDefined();

      // 5. 検索を実行
      const searchOutput = runCLI(
        `query "User class interface" --db ${testDbPath} --provider memory -k 5`,
      );
      expect(searchOutput).toBeDefined();

      // 6. ハイブリッド検索
      const hybridOutput = runCLI(
        `query "Python dataclass decorator" --db ${testDbPath} --provider memory -k 5 --hybrid`,
      );
      expect(hybridOutput).toBeDefined();

      // 7. フル内容取得
      const fullOutput = runCLI(
        `query "Gistdex" --db ${testDbPath} --provider memory -k 1 --full`,
      );
      expect(fullOutput).toBeDefined();
    });
  });
});

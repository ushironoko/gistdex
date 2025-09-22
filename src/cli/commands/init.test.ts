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
import { join } from "node:path";
import { cwd } from "node:process";
import * as inquirer from "@inquirer/prompts";

import { handleInit } from "./init.js";

// Mock modules
mock.module("@inquirer/prompts", () => ({
  confirm: jest.fn().mockResolvedValue(true),
  password: jest.fn().mockResolvedValue(""),
  select: jest.fn().mockResolvedValue("sqlite"),
  input: jest.fn().mockResolvedValue("./gistdex.db"),
}));
mock.module("node:fs", () => ({
  existsSync: jest.fn().mockReturnValue(false),
}));
mock.module("node:fs/promises", () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(""),
}));
mock.module("consola", () => ({
  consola: {
    box: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    success: jest.fn(),
    start: jest.fn(),
    fail: jest.fn(),
  },
}));

describe("handleInit", () => {
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalProcessExit = process.exit;

  beforeEach(() => {
    console.log = jest.fn();
    console.error = jest.fn();
    process.exit = jest.fn() as never;
    jest.clearAllMocks();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    process.exit = originalProcessExit;
  });

  describe("when API key is provided", () => {
    it("should create both .env and gistdex.config.ts files", async () => {
      // Mock user inputs
      const passwordMock = inquirer.password as Mock<typeof inquirer.password>;
      const selectMock = inquirer.select as Mock<typeof inquirer.select>;
      const inputMock = inquirer.input as Mock<typeof inquirer.input>;
      const confirmMock = inquirer.confirm as Mock<typeof inquirer.confirm>;

      passwordMock.mockResolvedValue("test-api-key");
      selectMock.mockResolvedValue("sqlite");
      inputMock.mockResolvedValue("./gistdex.db");
      confirmMock.mockResolvedValue(true);

      const { existsSync } = await import("node:fs");
      const existsSyncMock = existsSync as Mock<typeof existsSync>;
      existsSyncMock.mockReturnValue(false);

      const {
        promises: { writeFile },
      } = await import("node:fs");
      const writeFileMock = writeFile as Mock<typeof writeFile>;
      writeFileMock.mockResolvedValue(undefined);

      await handleInit({ silent: false });

      // Verify .env file was created
      expect(writeFile).toHaveBeenCalledWith(
        join(cwd(), ".env"),
        expect.stringContaining("GOOGLE_GENERATIVE_AI_API_KEY=test-api-key"),
        "utf-8",
      );

      // Verify gistdex.config.ts was created
      expect(writeFile).toHaveBeenCalledWith(
        join(cwd(), "gistdex.config.ts"),
        expect.stringContaining("defineGistdexConfig"),
        "utf-8",
      );

      // Verify both files were created
      expect(writeFile).toHaveBeenCalledTimes(2);
    });

    it("should only include API key in .env file", async () => {
      const passwordMock = inquirer.password as Mock<typeof inquirer.password>;
      const selectMock = inquirer.select as Mock<typeof inquirer.select>;
      const inputMock = inquirer.input as Mock<typeof inquirer.input>;
      const confirmMock = inquirer.confirm as Mock<typeof inquirer.confirm>;

      passwordMock.mockResolvedValue("test-api-key");
      selectMock.mockResolvedValue("sqlite");
      inputMock.mockResolvedValue("./gistdex.db");
      confirmMock.mockResolvedValue(true);

      const { existsSync } = await import("node:fs");
      const existsSyncMock = existsSync as Mock<typeof existsSync>;
      existsSyncMock.mockReturnValue(false);

      const {
        promises: { writeFile },
      } = await import("node:fs");
      const writeFileMock = writeFile as Mock<typeof writeFile>;
      writeFileMock.mockResolvedValue(undefined);

      await handleInit({ silent: false });

      const envFileCall = (
        writeFileMock.mock.calls as unknown as Array<[string, string, string]>
      ).find((call) => call[0].includes(".env"));

      expect(envFileCall).toBeDefined();
      const envContent = envFileCall?.[1] as string;

      // Should only contain API key and comments
      expect(envContent).toContain("GOOGLE_GENERATIVE_AI_API_KEY=test-api-key");
      expect(envContent).toContain("# Google AI API Key (Required)");
      expect(envContent).toContain("# Get your API key from:");

      // Should NOT contain other environment variables
      expect(envContent).not.toContain("VECTOR_DB_PROVIDER");
      expect(envContent).not.toContain("SQLITE_DB_PATH");
      expect(envContent).not.toContain("EMBEDDING_MODEL");
      expect(envContent).not.toContain("EMBEDDING_DIMENSION");
      expect(envContent).not.toContain("VECTOR_DB_CONFIG");
    });
  });

  describe("when API key is empty", () => {
    it("should skip .env creation and only create gistdex.config.ts", async () => {
      // Mock empty API key
      const passwordMock = inquirer.password as Mock<typeof inquirer.password>;
      const selectMock = inquirer.select as Mock<typeof inquirer.select>;
      const inputMock = inquirer.input as Mock<typeof inquirer.input>;
      const confirmMock = inquirer.confirm as Mock<typeof inquirer.confirm>;

      passwordMock.mockResolvedValue("");
      selectMock.mockResolvedValue("sqlite");
      inputMock.mockResolvedValue("./gistdex.db");
      confirmMock.mockResolvedValue(true);

      const { existsSync } = await import("node:fs");
      const existsSyncMock = existsSync as Mock<typeof existsSync>;
      existsSyncMock.mockReturnValue(false);

      const {
        promises: { writeFile },
      } = await import("node:fs");
      const writeFileMock = writeFile as Mock<typeof writeFile>;
      writeFileMock.mockResolvedValue(undefined);

      await handleInit({ silent: false });

      // Verify .env file was NOT created
      const envFileCall = (
        writeFileMock.mock.calls as unknown as Array<[string, string, string]>
      ).find((call) => call[0].includes(".env"));
      expect(envFileCall).toBeUndefined();

      // Verify gistdex.config.ts was still created
      expect(writeFile).toHaveBeenCalledWith(
        join(cwd(), "gistdex.config.ts"),
        expect.stringContaining("defineGistdexConfig"),
        "utf-8",
      );

      // Verify only one file was created
      expect(writeFile).toHaveBeenCalledTimes(1);
    });

    it("should display warning about skipping .env creation", async () => {
      const passwordMock = inquirer.password as Mock<typeof inquirer.password>;
      const selectMock = inquirer.select as Mock<typeof inquirer.select>;
      const inputMock = inquirer.input as Mock<typeof inquirer.input>;
      const confirmMock = inquirer.confirm as Mock<typeof inquirer.confirm>;

      passwordMock.mockResolvedValue("");
      selectMock.mockResolvedValue("sqlite");
      inputMock.mockResolvedValue("./gistdex.db");
      confirmMock.mockResolvedValue(true);

      const { existsSync } = await import("node:fs");
      const existsSyncMock = existsSync as Mock<typeof existsSync>;
      existsSyncMock.mockReturnValue(false);

      const {
        promises: { writeFile },
      } = await import("node:fs");
      const writeFileMock = writeFile as Mock<typeof writeFile>;
      writeFileMock.mockResolvedValue(undefined);

      await handleInit({ silent: false });

      // Verify warning message was displayed via consola
      const { consola } = await import("consola");
      expect(consola.warn).toHaveBeenCalledWith(
        expect.stringContaining("Skipping .env file creation"),
      );
      expect(consola.info).toHaveBeenCalledWith(
        expect.stringContaining(
          "You'll need to set GOOGLE_GENERATIVE_AI_API_KEY",
        ),
      );
    });
  });

  describe("when API key is whitespace only", () => {
    it("should skip .env creation for whitespace-only API key", async () => {
      // Mock whitespace-only API key
      const passwordMock = inquirer.password as Mock<typeof inquirer.password>;
      const selectMock = inquirer.select as Mock<typeof inquirer.select>;
      const inputMock = inquirer.input as Mock<typeof inquirer.input>;
      const confirmMock = inquirer.confirm as Mock<typeof inquirer.confirm>;

      passwordMock.mockResolvedValue("   ");
      selectMock.mockResolvedValue("sqlite");
      inputMock.mockResolvedValue("./gistdex.db");
      confirmMock.mockResolvedValue(true);

      const { existsSync } = await import("node:fs");
      const existsSyncMock = existsSync as Mock<typeof existsSync>;
      existsSyncMock.mockReturnValue(false);

      const {
        promises: { writeFile },
      } = await import("node:fs");
      const writeFileMock = writeFile as Mock<typeof writeFile>;
      writeFileMock.mockResolvedValue(undefined);

      await handleInit({ silent: false });

      // Verify .env file was NOT created
      const envFileCall = (
        writeFileMock.mock.calls as unknown as Array<[string, string, string]>
      ).find((call) => call[0].includes(".env"));
      expect(envFileCall).toBeUndefined();

      // Verify only gistdex.config.ts was created
      expect(writeFile).toHaveBeenCalledTimes(1);
    });
  });

  describe("force flag behavior", () => {
    it("should overwrite existing files when force flag is true", async () => {
      const passwordMock = inquirer.password as Mock<typeof inquirer.password>;
      const selectMock = inquirer.select as Mock<typeof inquirer.select>;
      const inputMock = inquirer.input as Mock<typeof inquirer.input>;
      const confirmMock = inquirer.confirm as Mock<typeof inquirer.confirm>;

      passwordMock.mockResolvedValue("test-api-key");
      selectMock.mockResolvedValue("sqlite");
      inputMock.mockResolvedValue("./gistdex.db");
      confirmMock.mockResolvedValue(true);

      const { existsSync } = await import("node:fs");
      const existsSyncMock = existsSync as Mock<typeof existsSync>;
      existsSyncMock.mockReturnValue(true); // Files exist

      const {
        promises: { writeFile },
      } = await import("node:fs");
      const writeFileMock = writeFile as Mock<typeof writeFile>;
      writeFileMock.mockResolvedValue(undefined);

      await handleInit({ force: true });

      // Should not ask for confirmation
      expect(inquirer.confirm).not.toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Do you want to overwrite existing files?",
        }),
      );

      // Should create files
      expect(writeFile).toHaveBeenCalledTimes(2);
    });
  });
});

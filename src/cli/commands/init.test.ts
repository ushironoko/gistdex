import { join } from "node:path";
import { cwd } from "node:process";
import * as inquirer from "@inquirer/prompts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleInit } from "./init.js";

// Mock modules
vi.mock("@inquirer/prompts");
vi.mock("node:fs");
vi.mock("consola", () => ({
  consola: {
    box: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    start: vi.fn(),
    fail: vi.fn(),
  },
}));

describe("handleInit", () => {
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalProcessExit = process.exit;

  beforeEach(() => {
    console.log = vi.fn();
    console.error = vi.fn();
    process.exit = vi.fn() as never;
    vi.clearAllMocks();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    process.exit = originalProcessExit;
  });

  describe("when API key is provided", () => {
    it("should create both .env and gistdex.config.ts files", async () => {
      // Mock user inputs
      vi.mocked(inquirer.password).mockResolvedValue("test-api-key");
      vi.mocked(inquirer.select).mockResolvedValue("sqlite");
      vi.mocked(inquirer.input).mockResolvedValue("./gistdex.db");
      vi.mocked(inquirer.confirm).mockResolvedValue(true);

      const { existsSync } = await import("node:fs");
      vi.mocked(existsSync).mockReturnValue(false);

      const {
        promises: { writeFile },
      } = await import("node:fs");
      vi.mocked(writeFile).mockResolvedValue(undefined);

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
      vi.mocked(inquirer.password).mockResolvedValue("test-api-key");
      vi.mocked(inquirer.select).mockResolvedValue("sqlite");
      vi.mocked(inquirer.input).mockResolvedValue("./gistdex.db");
      vi.mocked(inquirer.confirm).mockResolvedValue(true);

      const { existsSync } = await import("node:fs");
      vi.mocked(existsSync).mockReturnValue(false);

      const {
        promises: { writeFile },
      } = await import("node:fs");
      vi.mocked(writeFile).mockResolvedValue(undefined);

      await handleInit({ silent: false });

      const envFileCall = vi
        .mocked(writeFile)
        .mock.calls.find((call) => (call[0] as string).includes(".env"));

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
      vi.mocked(inquirer.password).mockResolvedValue("");
      vi.mocked(inquirer.select).mockResolvedValue("sqlite");
      vi.mocked(inquirer.input).mockResolvedValue("./gistdex.db");
      vi.mocked(inquirer.confirm).mockResolvedValue(true);

      const { existsSync } = await import("node:fs");
      vi.mocked(existsSync).mockReturnValue(false);

      const {
        promises: { writeFile },
      } = await import("node:fs");
      vi.mocked(writeFile).mockResolvedValue(undefined);

      await handleInit({ silent: false });

      // Verify .env file was NOT created
      const envFileCall = vi
        .mocked(writeFile)
        .mock.calls.find((call) => (call[0] as string).includes(".env"));
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
      vi.mocked(inquirer.password).mockResolvedValue("");
      vi.mocked(inquirer.select).mockResolvedValue("sqlite");
      vi.mocked(inquirer.input).mockResolvedValue("./gistdex.db");
      vi.mocked(inquirer.confirm).mockResolvedValue(true);

      const { existsSync } = await import("node:fs");
      vi.mocked(existsSync).mockReturnValue(false);

      const {
        promises: { writeFile },
      } = await import("node:fs");
      vi.mocked(writeFile).mockResolvedValue(undefined);

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
      vi.mocked(inquirer.password).mockResolvedValue("   ");
      vi.mocked(inquirer.select).mockResolvedValue("sqlite");
      vi.mocked(inquirer.input).mockResolvedValue("./gistdex.db");
      vi.mocked(inquirer.confirm).mockResolvedValue(true);

      const { existsSync } = await import("node:fs");
      vi.mocked(existsSync).mockReturnValue(false);

      const {
        promises: { writeFile },
      } = await import("node:fs");
      vi.mocked(writeFile).mockResolvedValue(undefined);

      await handleInit({ silent: false });

      // Verify .env file was NOT created
      const envFileCall = vi
        .mocked(writeFile)
        .mock.calls.find((call) => (call[0] as string).includes(".env"));
      expect(envFileCall).toBeUndefined();

      // Verify only gistdex.config.ts was created
      expect(writeFile).toHaveBeenCalledTimes(1);
    });
  });

  describe("force flag behavior", () => {
    it("should overwrite existing files when force flag is true", async () => {
      vi.mocked(inquirer.password).mockResolvedValue("test-api-key");
      vi.mocked(inquirer.select).mockResolvedValue("sqlite");
      vi.mocked(inquirer.input).mockResolvedValue("./gistdex.db");
      vi.mocked(inquirer.confirm).mockResolvedValue(true);

      const { existsSync } = await import("node:fs");
      vi.mocked(existsSync).mockReturnValue(true); // Files exist

      const {
        promises: { writeFile },
      } = await import("node:fs");
      vi.mocked(writeFile).mockResolvedValue(undefined);

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

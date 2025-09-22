import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createSafePathValidator,
  SecurityError,
  validateExternalUrl,
  validateFilePath,
  validateGistUrl,
  validateGitHubRepoUrl,
} from "../security/security.js";

describe("Security Module", () => {
  let testDir: string;
  let testFile: string;

  beforeEach(async () => {
    // Create a temporary test directory
    testDir = join(tmpdir(), `gistdex-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    // Create a test file
    testFile = join(testDir, "test.txt");
    await writeFile(testFile, "test content");
  });

  afterEach(async () => {
    // Clean up test directory
    await rm(testDir, { recursive: true, force: true });
  });

  describe("validateFilePath", () => {
    it("should allow files within the base directory", async () => {
      const result = await validateFilePath("test.txt", testDir, ["."]);
      // Use realpath to handle symlinks on macOS (/var -> /private/var)
      const { realpath: realpathFs } = await import("node:fs/promises");
      const expectedPath = await realpathFs(testFile);
      expect(result).toBe(expectedPath);
    });

    it("should reject path traversal attempts", async () => {
      await expect(
        validateFilePath("../../../etc/passwd", testDir, ["."]),
      ).rejects.toThrow(SecurityError);

      await expect(
        validateFilePath("../../etc/passwd", testDir, ["."]),
      ).rejects.toThrow(SecurityError);
    });

    it("should reject encoded path traversal attempts", async () => {
      await expect(
        validateFilePath("..%2F..%2F..%2Fetc%2Fpasswd", testDir, ["."]),
      ).rejects.toThrow(SecurityError);
    });

    it("should reject absolute paths to system directories", async () => {
      await expect(
        validateFilePath("/etc/passwd", testDir, ["."]),
      ).rejects.toThrow(SecurityError);

      await expect(
        validateFilePath("/root/.bash_history", testDir, ["."]),
      ).rejects.toThrow(SecurityError);

      await expect(
        validateFilePath("/var/log/auth.log", testDir, ["."]),
      ).rejects.toThrow(SecurityError);
    });

    it("should handle symbolic links safely", async () => {
      // Create a symlink pointing outside the safe area
      const symlinkPath = join(testDir, "malicious_link");
      const outsidePath = join(tmpdir(), "outside_file");

      await writeFile(outsidePath, "outside content");
      await symlink(outsidePath, symlinkPath);

      await expect(
        validateFilePath("malicious_link", testDir, ["."]),
      ).rejects.toThrow(SecurityError);

      // Clean up
      await rm(outsidePath, { force: true });
    });

    it("should allow files in permitted subdirectories", async () => {
      const subDir = join(testDir, "docs");
      await mkdir(subDir);
      const subFile = join(subDir, "readme.md");
      await writeFile(subFile, "# README");

      const result = await validateFilePath("docs/readme.md", testDir, [
        ".",
        "./docs",
      ]);
      // Use realpath to handle symlinks on macOS (/var -> /private/var)
      const { realpath: realpathFs } = await import("node:fs/promises");
      const expectedPath = await realpathFs(subFile);
      expect(result).toBe(expectedPath);
    });

    it("should reject empty or invalid paths", async () => {
      await expect(validateFilePath("", testDir)).rejects.toThrow(
        SecurityError,
      );
      await expect(
        validateFilePath(null as unknown as string, testDir),
      ).rejects.toThrow(SecurityError);
      await expect(
        validateFilePath(undefined as unknown as string, testDir),
      ).rejects.toThrow(SecurityError);
    });
  });

  describe("validateExternalUrl", () => {
    it("should allow valid GitHub URLs", () => {
      expect(() =>
        validateExternalUrl("https://github.com/user/repo"),
      ).not.toThrow();
      expect(() =>
        validateExternalUrl("https://api.github.com/repos/user/repo"),
      ).not.toThrow();
      expect(() =>
        validateExternalUrl("https://gist.github.com/user/abc123"),
      ).not.toThrow();
      expect(() =>
        validateExternalUrl(
          "https://raw.githubusercontent.com/user/repo/main/file.txt",
        ),
      ).not.toThrow();
    });

    it("should reject non-HTTPS URLs", () => {
      expect(() => validateExternalUrl("http://github.com/user/repo")).toThrow(
        SecurityError,
      );
      expect(() => validateExternalUrl("ftp://github.com/user/repo")).toThrow(
        SecurityError,
      );
    });

    it("should reject non-allowed domains", () => {
      expect(() =>
        validateExternalUrl("https://malicious.com/file.txt"),
      ).toThrow(SecurityError);
      expect(() =>
        validateExternalUrl("https://evil.github.com.malicious.com/file"),
      ).toThrow(SecurityError);
      expect(() =>
        validateExternalUrl("https://pastebin.com/raw/abc123"),
      ).toThrow(SecurityError);
    });

    it("should reject invalid URLs", () => {
      expect(() => validateExternalUrl("not-a-url")).toThrow(SecurityError);
      expect(() => validateExternalUrl("")).toThrow(SecurityError);
      expect(() => validateExternalUrl(null as unknown as string)).toThrow(
        SecurityError,
      );
    });
  });

  describe("validateGitHubRepoUrl", () => {
    it("should parse valid GitHub repository URLs", () => {
      const result = validateGitHubRepoUrl("https://github.com/user/repo");
      expect(result).toEqual({ owner: "user", repo: "repo" });

      const resultWithGit = validateGitHubRepoUrl(
        "https://github.com/user/repo.git",
      );
      expect(resultWithGit).toEqual({ owner: "user", repo: "repo" });
    });

    it("should reject non-GitHub URLs", () => {
      expect(() =>
        validateGitHubRepoUrl("https://gitlab.com/user/repo"),
      ).toThrow(SecurityError);
      expect(() =>
        validateGitHubRepoUrl("https://bitbucket.org/user/repo"),
      ).toThrow(SecurityError);
    });

    it("should reject invalid repository formats", () => {
      expect(() => validateGitHubRepoUrl("https://github.com/user")).toThrow(
        SecurityError,
      );
      expect(() => validateGitHubRepoUrl("https://github.com/")).toThrow(
        SecurityError,
      );
      expect(() => validateGitHubRepoUrl("https://github.com")).toThrow(
        SecurityError,
      );
    });

    it("should validate owner and repository names", () => {
      expect(() =>
        validateGitHubRepoUrl("https://github.com/user@evil/repo"),
      ).toThrow(SecurityError);
      expect(() =>
        validateGitHubRepoUrl("https://github.com/user/repo<script>"),
      ).toThrow(SecurityError);
    });
  });

  describe("validateGistUrl", () => {
    it("should parse valid Gist URLs", () => {
      const gistId = validateGistUrl(
        "https://gist.github.com/user/abc123def456",
      );
      expect(gistId).toBe("abc123def456");

      const gistId2 = validateGistUrl(
        "https://gist.github.com/username/1234567890abcdef",
      );
      expect(gistId2).toBe("1234567890abcdef");
    });

    it("should reject non-Gist URLs", () => {
      expect(() => validateGistUrl("https://github.com/user/repo")).toThrow(
        SecurityError,
      );
      expect(() => validateGistUrl("https://pastebin.com/abc123")).toThrow(
        SecurityError,
      );
    });

    it("should reject invalid Gist formats", () => {
      expect(() => validateGistUrl("https://gist.github.com/user")).toThrow(
        SecurityError,
      );
      expect(() =>
        validateGistUrl("https://gist.github.com/user/invalid-gist-id"),
      ).toThrow(SecurityError);
      expect(() =>
        validateGistUrl("https://gist.github.com/user/ABCDEF"),
      ).toThrow(SecurityError); // uppercase not allowed
    });
  });

  describe("createSafePathValidator", () => {
    it("should create a validator with custom base directory", async () => {
      const validator = createSafePathValidator(testDir, ["."]);

      const result = await validator("test.txt");
      // Use realpath to handle symlinks on macOS (/var -> /private/var)
      const { realpath: realpathFs } = await import("node:fs/promises");
      const expectedPath = await realpathFs(testFile);
      expect(result).toBe(expectedPath);

      await expect(validator("../../../etc/passwd")).rejects.toThrow(
        SecurityError,
      );
    });

    it("should work with custom allowed subdirectories", async () => {
      const subDir = join(testDir, "allowed");
      await mkdir(subDir);
      const subFile = join(subDir, "file.txt");
      await writeFile(subFile, "content");

      const validator = createSafePathValidator(testDir, ["./allowed"]);

      const result = await validator("allowed/file.txt");
      // Use realpath to handle symlinks on macOS (/var -> /private/var)
      const { realpath: realpathFs } = await import("node:fs/promises");
      const expectedPath = await realpathFs(subFile);
      expect(result).toBe(expectedPath);

      // Should reject files in the base directory since it's not in allowed paths
      await expect(validator("test.txt")).rejects.toThrow(SecurityError);
    });
  });

  describe("SecurityError", () => {
    it("should create SecurityError with message and code", () => {
      const error = new SecurityError("Test message", "TEST_CODE");
      expect(error.message).toBe("Test message");
      expect(error.code).toBe("TEST_CODE");
      expect(error.name).toBe("SecurityError");
      expect(error).toBeInstanceOf(Error);
    });
  });
});

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { getCacheDir } from "./cache-utils.js";

describe("cache-utils", () => {
  const testDir = join(process.cwd(), "test-cache");

  beforeEach(() => {
    // Clean up any existing test cache
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test cache
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe("getCacheDir", () => {
    it("should return cache directory path", () => {
      const cacheDir = getCacheDir();
      expect(cacheDir).toBe(join(process.cwd(), ".gistdex", "cache"));
    });

    it("should create .gistdex directory if it doesn't exist", () => {
      const originalCwd = process.cwd();

      try {
        // Change to test directory
        process.chdir = () => testDir;
        Object.defineProperty(process, "cwd", {
          value: () => testDir,
          configurable: true,
        });

        // Create test directory
        mkdirSync(testDir, { recursive: true });

        const cacheDir = getCacheDir();
        const gistdexDir = join(testDir, ".gistdex");

        expect(existsSync(gistdexDir)).toBe(true);
        expect(cacheDir).toBe(join(testDir, ".gistdex", "cache"));
      } finally {
        // Restore original cwd
        Object.defineProperty(process, "cwd", {
          value: () => originalCwd,
          configurable: true,
        });
      }
    });
  });
});

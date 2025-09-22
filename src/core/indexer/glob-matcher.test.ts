import { describe, expect, it } from "bun:test";
import {
  createGlobMatcher,
  filterPathsWithGlob,
  hasAnyGlobPattern,
  hasGlobPattern,
  parsePatterns,
} from "./glob-matcher.js";

describe("glob-matcher", () => {
  describe("hasGlobPattern", () => {
    it("should detect glob patterns", () => {
      expect(hasGlobPattern("*.ts")).toBe(true);
      expect(hasGlobPattern("**/*.js")).toBe(true);
      expect(hasGlobPattern("src/**")).toBe(true);
      expect(hasGlobPattern("file?.txt")).toBe(true);
      expect(hasGlobPattern("{a,b}.js")).toBe(true);
      expect(hasGlobPattern("[abc].txt")).toBe(true);
      expect(hasGlobPattern("!(exclude).js")).toBe(true);
    });

    it("should not detect regular paths as glob patterns", () => {
      expect(hasGlobPattern("src/index.ts")).toBe(false);
      expect(hasGlobPattern("path/to/file.js")).toBe(false);
      expect(hasGlobPattern("")).toBe(false);
      expect(hasGlobPattern(".")).toBe(false);
    });
  });

  describe("parsePatterns", () => {
    it("should parse comma-separated patterns", () => {
      expect(parsePatterns("*.ts,*.js")).toEqual(["*.ts", "*.js"]);
      expect(parsePatterns("src/**/*.ts, lib/**/*.js")).toEqual([
        "src/**/*.ts",
        "lib/**/*.js",
      ]);
      expect(parsePatterns("  *.md  ,  *.txt  ")).toEqual(["*.md", "*.txt"]);
    });

    it("should handle single pattern", () => {
      expect(parsePatterns("**/*.ts")).toEqual(["**/*.ts"]);
    });

    it("should filter out empty patterns", () => {
      expect(parsePatterns("*.ts,,*.js")).toEqual(["*.ts", "*.js"]);
      expect(parsePatterns(",,,")).toEqual([]);
    });
  });

  describe("createGlobMatcher", () => {
    it("should match files with glob patterns", () => {
      const matcher = createGlobMatcher(["**/*.ts"]);
      expect(matcher("src/index.ts")).toBe(true);
      expect(matcher("lib/utils/helper.ts")).toBe(true);
      expect(matcher("index.js")).toBe(false);
      expect(matcher("README.md")).toBe(false);
    });

    it("should match multiple patterns", () => {
      const matcher = createGlobMatcher(["**/*.ts", "**/*.js"]);
      expect(matcher("src/index.ts")).toBe(true);
      expect(matcher("lib/utils.js")).toBe(true);
      expect(matcher("README.md")).toBe(false);
    });

    it("should match specific directory patterns", () => {
      const matcher = createGlobMatcher(["src/**/*.ts", "lib/**/*.js"]);
      expect(matcher("src/index.ts")).toBe(true);
      expect(matcher("src/utils/helper.ts")).toBe(true);
      expect(matcher("lib/index.js")).toBe(true);
      expect(matcher("lib/utils/helper.js")).toBe(true);
      expect(matcher("test/index.ts")).toBe(false);
      expect(matcher("index.ts")).toBe(false);
    });

    it("should handle root patterns", () => {
      const matcher = createGlobMatcher(["", "src/**/*.ts"]);
      expect(matcher("index.ts")).toBe(true); // Root file
      expect(matcher("README.md")).toBe(true); // Root file
      expect(matcher("src/file.ts")).toBe(true); // Matches second pattern
    });

    it("should return false for empty patterns", () => {
      const matcher = createGlobMatcher([]);
      expect(matcher("any/path.ts")).toBe(false);
    });
  });

  describe("filterPathsWithGlob", () => {
    const paths = [
      "index.ts",
      "README.md",
      "src/index.ts",
      "src/utils.ts",
      "src/components/Button.tsx",
      "lib/index.js",
      "lib/utils.js",
      "test/index.test.ts",
      "docs/guide.md",
    ];

    it("should filter paths with single pattern", () => {
      const result = filterPathsWithGlob(paths, ["**/*.ts"]);
      expect(result).toEqual([
        "index.ts",
        "src/index.ts",
        "src/utils.ts",
        "test/index.test.ts",
      ]);
    });

    it("should filter paths with multiple patterns", () => {
      const result = filterPathsWithGlob(paths, ["**/*.ts", "**/*.tsx"]);
      expect(result).toEqual([
        "index.ts",
        "src/index.ts",
        "src/utils.ts",
        "src/components/Button.tsx",
        "test/index.test.ts",
      ]);
    });

    it("should filter paths with directory-specific patterns", () => {
      const result = filterPathsWithGlob(paths, ["src/**/*"]);
      expect(result).toEqual([
        "src/index.ts",
        "src/utils.ts",
        "src/components/Button.tsx",
      ]);
    });

    it("should handle multiple directory patterns", () => {
      const result = filterPathsWithGlob(paths, ["src/**/*.ts", "lib/**/*.js"]);
      expect(result).toEqual([
        "src/index.ts",
        "src/utils.ts",
        "lib/index.js",
        "lib/utils.js",
      ]);
    });

    it("should return empty array for non-matching patterns", () => {
      const result = filterPathsWithGlob(paths, ["**/*.py"]);
      expect(result).toEqual([]);
    });
  });

  describe("hasAnyGlobPattern", () => {
    it("should detect if any pattern has glob", () => {
      expect(hasAnyGlobPattern(["*.ts", "src/index.ts"])).toBe(true);
      expect(hasAnyGlobPattern(["src/index.ts", "**/*.js"])).toBe(true);
      expect(hasAnyGlobPattern(["src/index.ts", "lib/utils.js"])).toBe(false);
      expect(hasAnyGlobPattern([])).toBe(false);
    });
  });
});

import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  analyzeDiff,
  type DiffChange,
  extractSymbols,
  generateSearchQueries,
} from "./diff-analyzer.js";

describe("diff-analyzer", () => {
  let testRepoPath: string;

  beforeAll(() => {
    // Create temporary git repository for testing
    testRepoPath = mkdtempSync(join(tmpdir(), "gistdex-test-"));

    // Initialize git repo
    execSync("git init", { cwd: testRepoPath });
    execSync('git config user.email "test@test.com"', { cwd: testRepoPath });
    execSync('git config user.name "Test User"', { cwd: testRepoPath });

    // Create initial commit
    writeFileSync(
      join(testRepoPath, "test.ts"),
      `export function oldFunction() {
  return "old";
}`,
    );
    execSync("git add .", { cwd: testRepoPath });
    execSync('git commit -m "Initial commit"', { cwd: testRepoPath });

    // Create changes
    writeFileSync(
      join(testRepoPath, "test.ts"),
      `export function oldFunction() {
  return "modified";
}

export function newFunction() {
  return "new";
}`,
    );
    writeFileSync(
      join(testRepoPath, "added.ts"),
      `export class NewClass {
  constructor() {}
}`,
    );
    execSync("git add .", { cwd: testRepoPath });
    execSync('git commit -m "Add changes"', { cwd: testRepoPath });
  });

  afterAll(() => {
    // Clean up test repository
    if (testRepoPath) {
      rmSync(testRepoPath, { recursive: true, force: true });
    }
  });

  describe("analyzeDiff", () => {
    it("should analyze git diff and return changes", async () => {
      // Change to test repo directory
      const originalCwd = process.cwd();
      process.chdir(testRepoPath);

      try {
        const result = await analyzeDiff("HEAD~1..HEAD");

        expect(result.changes).toBeDefined();
        expect(result.searchQueries).toBeDefined();
        expect(result.changes.length).toBeGreaterThan(0);

        // Check for modified file
        const modifiedFile = result.changes.find((c) => c.file === "test.ts");
        expect(modifiedFile).toBeDefined();
        expect(modifiedFile?.type).toBe("modified");
        expect(modifiedFile?.symbols).toContain("newFunction");

        // Check for added file
        const addedFile = result.changes.find((c) => c.file === "added.ts");
        expect(addedFile).toBeDefined();
        expect(addedFile?.type).toBe("added");
        expect(addedFile?.symbols).toContain("NewClass");

        // Check search queries
        expect(result.searchQueries).toContain("newFunction");
        expect(result.searchQueries).toContain("NewClass");
      } finally {
        process.chdir(originalCwd);
      }
    });

    it("should handle deleted files", async () => {
      const originalCwd = process.cwd();
      process.chdir(testRepoPath);

      try {
        // Create and delete a file
        writeFileSync(
          join(testRepoPath, "toDelete.ts"),
          `export function willBeDeleted() {}`,
        );
        execSync("git add .", { cwd: testRepoPath });
        execSync('git commit -m "Add file to delete"', { cwd: testRepoPath });

        execSync("git rm toDelete.ts", { cwd: testRepoPath });
        execSync('git commit -m "Delete file"', { cwd: testRepoPath });

        const result = await analyzeDiff("HEAD~1..HEAD");

        const deletedFile = result.changes.find(
          (c) => c.file === "toDelete.ts",
        );
        expect(deletedFile).toBeDefined();
        expect(deletedFile?.type).toBe("deleted");
        expect(deletedFile?.symbols).toContain("willBeDeleted");
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe("extractSymbols", () => {
    it("should extract TypeScript functions", () => {
      const content = `
        export function myFunction() {}
        export async function asyncFunc() {}
        function privateFunc() {}
        const arrowFunc = () => {};
        export const exportedArrow = async () => {};
      `;

      const symbols = extractSymbols(content, "test.ts");

      expect(symbols).toContain("myFunction");
      expect(symbols).toContain("asyncFunc");
      expect(symbols).toContain("privateFunc");
      expect(symbols).toContain("arrowFunc");
      expect(symbols).toContain("exportedArrow");
    });

    it("should extract TypeScript classes and interfaces", () => {
      const content = `
        export class MyClass {}
        interface MyInterface {}
        export type MyType = string;
      `;

      const symbols = extractSymbols(content, "test.ts");

      expect(symbols).toContain("MyClass");
      expect(symbols).toContain("MyInterface");
      expect(symbols).toContain("MyType");
    });

    it("should extract Python functions and classes", () => {
      const content = `
def my_function():
    pass

class MyClass:
    def method(self):
        pass
      `;

      const symbols = extractSymbols(content, "test.py");

      expect(symbols).toContain("my_function");
      expect(symbols).toContain("MyClass");
      expect(symbols).toContain("method");
    });

    it("should remove duplicate symbols", () => {
      const content = `
        function duplicate() {}
        function duplicate() {}
      `;

      const symbols = extractSymbols(content, "test.js");

      expect(symbols.filter((s) => s === "duplicate").length).toBe(1);
    });
  });

  describe("generateSearchQueries", () => {
    it("should generate queries from changes", () => {
      const changes: DiffChange[] = [
        {
          type: "modified",
          file: "src/utils/helper.ts",
          content: "export function processData() {}",
          symbols: ["processData", "formatOutput"],
        },
      ];

      const queries = generateSearchQueries(changes);

      expect(queries).toContain("helper");
      expect(queries).toContain("processData");
      expect(queries).toContain("formatOutput");
      expect(queries).toContain("process data");
      expect(queries).toContain("format output");
    });

    it("should limit number of queries", () => {
      const changes: DiffChange[] = [
        {
          type: "modified",
          file: "test.ts",
          content: "code",
          symbols: Array(50)
            .fill(0)
            .map((_, i) => `symbol${i}`),
        },
      ];

      const queries = generateSearchQueries(changes);

      expect(queries.length).toBeLessThanOrEqual(20);
    });

    it("should handle camelCase to space conversion", () => {
      const changes: DiffChange[] = [
        {
          type: "modified",
          file: "test.ts",
          content: "",
          symbols: ["getUserById", "updateUserProfile"],
        },
      ];

      const queries = generateSearchQueries(changes);

      expect(queries).toContain("get user by id");
      expect(queries).toContain("update user profile");
    });
  });
});

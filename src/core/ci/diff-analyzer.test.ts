import { spawnSync } from "node:child_process";
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

// Helper function to run git commands safely
function runGitCommand(command: string, args: string[], cwd: string): void {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
  });

  if (result.error) {
    throw new Error(`Git command failed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const stderr = result.stderr || "";
    const stdout = result.stdout || "";
    throw new Error(
      `Git command failed with status ${result.status}: ${stderr || stdout}`,
    );
  }
}

describe("diff-analyzer", () => {
  let testRepoPath: string;

  beforeAll(() => {
    // Create temporary git repository for testing
    testRepoPath = mkdtempSync(join(tmpdir(), "gistdex-test-"));

    // Initialize git repo
    runGitCommand("git", ["init"], testRepoPath);
    runGitCommand(
      "git",
      ["config", "user.email", "test@test.com"],
      testRepoPath,
    );
    runGitCommand("git", ["config", "user.name", "Test User"], testRepoPath);

    // Create initial commit
    writeFileSync(
      join(testRepoPath, "test.ts"),
      `export function oldFunction() {
  return "old";
}`,
    );
    runGitCommand("git", ["add", "."], testRepoPath);
    runGitCommand("git", ["commit", "-m", "Initial commit"], testRepoPath);

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
    runGitCommand("git", ["add", "."], testRepoPath);
    runGitCommand("git", ["commit", "-m", "Add changes"], testRepoPath);
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
        runGitCommand("git", ["add", "."], testRepoPath);
        runGitCommand(
          "git",
          ["commit", "-m", "Add file to delete"],
          testRepoPath,
        );

        runGitCommand("git", ["rm", "toDelete.ts"], testRepoPath);
        runGitCommand("git", ["commit", "-m", "Delete file"], testRepoPath);

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
    it("should extract TypeScript functions", async () => {
      const content = `
        export function myFunction() {}
        export async function asyncFunc() {}
        function privateFunc() {}
        const arrowFunc = () => {};
        export const exportedArrow = async () => {};
      `;

      const symbols = await extractSymbols(content, "test.ts");

      expect(symbols).toContain("myFunction");
      expect(symbols).toContain("asyncFunc");
      expect(symbols).toContain("privateFunc");
      expect(symbols).toContain("arrowFunc");
      expect(symbols).toContain("exportedArrow");
    });

    it("should extract TypeScript classes and interfaces", async () => {
      const content = `
        export class MyClass {}
        interface MyInterface {}
        export type MyType = string;
      `;

      const symbols = await extractSymbols(content, "test.ts");

      expect(symbols).toContain("MyClass");
      expect(symbols).toContain("MyInterface");
      expect(symbols).toContain("MyType");
    });

    it("should extract Python functions and classes", async () => {
      const content = `
def my_function():
    pass

class MyClass:
    def method(self):
        pass
      `;

      const symbols = await extractSymbols(content, "test.py");

      expect(symbols).toContain("my_function");
      expect(symbols).toContain("MyClass");
      expect(symbols).toContain("method");
    });

    it("should remove duplicate symbols", async () => {
      const content = `
        function duplicate() {}
        function duplicate() {}
      `;

      const symbols = await extractSymbols(content, "test.js");

      expect(symbols.filter((s) => s === "duplicate").length).toBe(1);
    });

    it("should extract Go functions and types", async () => {
      const content = `
package main

func main() {
    fmt.Println("Hello")
}

func processData(data string) error {
    return nil
}

type Config struct {
    Name string
}

type Handler interface {
    Handle()
}
      `;

      const symbols = await extractSymbols(content, "main.go");

      expect(symbols).toContain("main");
      expect(symbols).toContain("processData");
      expect(symbols).toContain("Config");
      expect(symbols).toContain("Handler");
    });

    it("should extract Rust functions and structs", async () => {
      const content = `
pub fn main() {
    println!("Hello");
}

pub async fn process_data(data: &str) -> Result<()> {
    Ok(())
}

pub struct Config {
    name: String,
}

pub enum Status {
    Active,
    Inactive,
}

pub trait Handler {
    fn handle(&self);
}
      `;

      const symbols = await extractSymbols(content, "main.rs");

      expect(symbols).toContain("main");
      expect(symbols).toContain("process_data");
      expect(symbols).toContain("Config");
      expect(symbols).toContain("Status");
      expect(symbols).toContain("Handler");
    });

    it("should extract Java classes and methods", async () => {
      const content = `
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello");
    }

    private void processData(String data) {
        // Process
    }
}

public interface Handler {
    void handle();
}
      `;

      const symbols = await extractSymbols(content, "Main.java");

      expect(symbols).toContain("Main");
      expect(symbols).toContain("main");
      expect(symbols).toContain("processData");
      expect(symbols).toContain("Handler");
    });

    it("should extract Ruby classes and methods", async () => {
      const content = `
class User
  def initialize(name)
    @name = name
  end

  def greet
    puts "Hello"
  end
end

module Authentication
  def authenticate
    true
  end
end
      `;

      const symbols = await extractSymbols(content, "user.rb");

      expect(symbols).toContain("User");
      expect(symbols).toContain("initialize");
      expect(symbols).toContain("greet");
      expect(symbols).toContain("Authentication");
      expect(symbols).toContain("authenticate");
    });

    it("should extract C functions and structs", async () => {
      const content = `
#include <stdio.h>

void hello() {
    printf("Hello\\n");
}

int main() {
    hello();
    return 0;
}

struct Point {
    int x;
    int y;
};

enum Status {
    ACTIVE,
    INACTIVE
};
      `;

      const symbols = await extractSymbols(content, "main.c");

      expect(symbols).toContain("hello");
      expect(symbols).toContain("main");
      expect(symbols).toContain("Point");
      expect(symbols).toContain("Status");
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

      expect(queries.length).toBeLessThanOrEqual(30); // Updated to match implementation limit
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

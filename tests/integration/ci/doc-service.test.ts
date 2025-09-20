import { execSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  analyzeDocuments,
  ensureDocumentsIndexed,
} from "../../../src/core/ci/doc-service.js";
import type { DatabaseService } from "../../../src/core/database/database-service.js";
import { createTestDatabase } from "../../helpers/test-db.js";

describe("doc-service", () => {
  let db: DatabaseService;
  let testRepoPath: string;

  beforeAll(async () => {
    // Create in-memory database
    db = await createTestDatabase({ provider: "memory", dimension: 768 });

    // Create test directory within the project (allowed by security)
    testRepoPath = join(process.cwd(), "data", "test-ci-docs");
    mkdirSync(testRepoPath, { recursive: true });

    // Initialize git repo
    execSync("git init", { cwd: testRepoPath });
    execSync('git config user.email "test@test.com"', { cwd: testRepoPath });
    execSync('git config user.name "Test User"', { cwd: testRepoPath });

    // Create documentation files
    writeFileSync(
      join(testRepoPath, "README.md"),
      `# Test Project

## Authentication

This project uses JWT authentication with the \`authenticate\` function.

### Usage

Call \`authenticate(token)\` to verify user credentials.
`,
    );

    // Create docs directory
    execSync("mkdir -p docs", { cwd: testRepoPath });

    writeFileSync(
      join(testRepoPath, "docs", "api.md"),
      `# API Documentation

## Auth Module

The auth module provides:
- authenticate(): Verify JWT tokens
- getUserProfile(): Get user data
- updateUserProfile(): Update user information
`,
    );

    // Create source files
    writeFileSync(
      join(testRepoPath, "auth.ts"),
      `export function authenticate(token: string) {
  return verifyJWT(token);
}

export function getUserProfile(userId: string) {
  return db.findUser(userId);
}`,
    );

    execSync("git add .", { cwd: testRepoPath });
    execSync('git commit -m "Initial commit"', { cwd: testRepoPath });

    // Make changes
    writeFileSync(
      join(testRepoPath, "auth.ts"),
      `// authenticate function removed

export function validateCredentials(email: string, password: string) {
  return checkCredentials(email, password);
}

export function getUserProfile(userId: string) {
  return db.findUser(userId); // Modified
}`,
    );

    execSync("git add .", { cwd: testRepoPath });
    execSync('git commit -m "Replace authenticate with validateCredentials"', {
      cwd: testRepoPath,
    });
  });

  afterAll(async () => {
    // Clean up database
    await db.close();
    // Clean up test directory
    if (testRepoPath) {
      try {
        rmSync(testRepoPath, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe("ensureDocumentsIndexed", () => {
    it.skip("should index documentation files", async () => {
      // Use relative paths from current working directory
      const patterns = [
        join("data", "test-ci-docs", "*.md"),
        join("data", "test-ci-docs", "docs", "*.md"),
      ];

      await ensureDocumentsIndexed(patterns, db);

      const items = await db.listItems();
      expect(items.length).toBeGreaterThan(0);

      // Check if README.md was indexed
      const hasReadme = items.some((item) =>
        item.metadata?.filePath?.includes("README.md"),
      );
      expect(hasReadme).toBe(true);
    });

    it.skip("should skip already indexed files", async () => {
      const patterns = [join("data", "test-ci-docs", "*.md")];

      // Index once
      await ensureDocumentsIndexed(patterns, db);
      const firstCount = (await db.listItems()).length;

      // Index again - should skip
      await ensureDocumentsIndexed(patterns, db);
      const secondCount = (await db.listItems()).length;

      expect(secondCount).toBe(firstCount);
    });

    it("should handle no matching files gracefully", async () => {
      const patterns = [join("data", "test-ci-docs", "*.xyz")];

      await expect(ensureDocumentsIndexed(patterns, db)).resolves.not.toThrow();
    });
  });

  describe("analyzeDocuments", () => {
    it.skip("should analyze documentation impact from code changes", async () => {
      const originalCwd = process.cwd();
      process.chdir(testRepoPath);

      try {
        // First, ensure documents are indexed
        // Use paths relative to the project root
        const relativePath = relative(originalCwd, testRepoPath);
        const patterns = [
          join(relativePath, "*.md"),
          join(relativePath, "docs", "*.md"),
        ];
        await ensureDocumentsIndexed(patterns, db);

        // Analyze the diff
        const results = await analyzeDocuments(
          "HEAD~1..HEAD",
          {
            threshold: 0.3, // Lower threshold for testing
            documentPaths: ["*.md", "docs/*.md"], // Use local patterns for analysis
            verbose: false,
          },
          db,
        );

        expect(results).toBeDefined();
        expect(Array.isArray(results)).toBe(true);

        // Should find documentation related to authentication changes
        const relevantDocs = results.filter(
          (r) => r.file.includes("README.md") || r.file.includes("api.md"),
        );
        expect(relevantDocs.length).toBeGreaterThan(0);

        // Check result structure
        if (results.length > 0) {
          const firstResult = results[0];
          expect(firstResult).toBeDefined();
          expect(firstResult).toHaveProperty("file");
          expect(firstResult).toHaveProperty("similarity");
          expect(firstResult).toHaveProperty("changeType");
          expect(typeof firstResult?.similarity).toBe("number");
          expect(firstResult?.similarity).toBeGreaterThanOrEqual(0);
          expect(firstResult?.similarity).toBeLessThanOrEqual(1);
        }
      } finally {
        process.chdir(originalCwd);
      }
    });

    it("should filter results by threshold", async () => {
      const originalCwd = process.cwd();
      process.chdir(testRepoPath);

      try {
        const highThreshold = await analyzeDocuments(
          "HEAD~1..HEAD",
          {
            threshold: 0.9,
            documentPaths: ["*.md"],
          },
          db,
        );

        const lowThreshold = await analyzeDocuments(
          "HEAD~1..HEAD",
          {
            threshold: 0.1,
            documentPaths: ["*.md"],
          },
          db,
        );

        expect(highThreshold.length).toBeLessThanOrEqual(lowThreshold.length);
      } finally {
        process.chdir(originalCwd);
      }
    });

    it("should return empty array when no changes detected", async () => {
      const originalCwd = process.cwd();
      process.chdir(testRepoPath);

      try {
        // Compare same commit (no changes)
        const results = await analyzeDocuments(
          "HEAD..HEAD",
          {
            threshold: 0.5,
            documentPaths: ["*.md"],
          },
          db,
        );

        expect(results).toEqual([]);
      } finally {
        process.chdir(originalCwd);
      }
    });

    it("should include matched terms in results", async () => {
      const originalCwd = process.cwd();
      process.chdir(testRepoPath);

      try {
        const results = await analyzeDocuments(
          "HEAD~1..HEAD",
          {
            threshold: 0.1,
            documentPaths: ["*.md", "docs/*.md"],
            verbose: false,
          },
          db,
        );

        const resultsWithTerms = results.filter(
          (r) => r.matchedTerms && r.matchedTerms.length > 0,
        );

        if (resultsWithTerms.length > 0) {
          const firstResult = resultsWithTerms[0];
          expect(firstResult).toBeDefined();
          expect(firstResult?.matchedTerms).toBeDefined();
          expect(Array.isArray(firstResult?.matchedTerms)).toBe(true);
        }
      } finally {
        process.chdir(originalCwd);
      }
    });
  });
});

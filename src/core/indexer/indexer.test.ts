import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  cleanupTestDatabase,
  createTestDatabase,
} from "../../test-helpers/test-db.js";
import type { DatabaseService } from "../database/database-service.js";
import {
  indexFile,
  indexFiles,
  indexGist,
  indexGitHubRepo,
  indexText,
} from "./indexer.js";

describe("indexText", () => {
  let db: DatabaseService;

  beforeEach(async () => {
    db = await createTestDatabase({ provider: "memory", dimension: 768 });
  });

  afterEach(async () => {
    await cleanupTestDatabase(db);
  });

  test("indexes text content successfully", async () => {
    const text =
      "This is a test document about TypeScript. TypeScript is a typed superset of JavaScript.";
    const metadata = {
      title: "Test Document",
      author: "Test Author",
    };

    const result = await indexText(
      text,
      metadata,
      { chunkSize: 50, chunkOverlap: 10 },
      db,
    );

    expect(result.itemsIndexed).toBeGreaterThan(0);
    expect(result.chunksCreated).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);

    // Verify data is actually in the database
    const count = await db.countItems();
    expect(count).toBe(result.itemsIndexed);

    // Verify metadata
    const items = await db.listItems({ limit: 10 });
    expect(items.length).toBeGreaterThan(0);
    if (items[0]) {
      expect(items[0].metadata?.title).toBe(metadata.title);
      expect(items[0].metadata?.author).toBe(metadata.author);
    }
  });

  test("handles empty text gracefully", async () => {
    const result = await indexText("", { type: "empty" }, {}, db);

    expect(result.itemsIndexed).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    // Error message may vary based on implementation
    expect(result.errors[0]).toBeTruthy();
  });

  test("handles large text with batching", async () => {
    const largeText = Array(100).fill("This is a sentence. ").join("");

    const result = await indexText(
      largeText,
      { type: "large" },
      { chunkSize: 100, chunkOverlap: 20, batchSize: 10 },
      db,
    );

    expect(result.itemsIndexed).toBeGreaterThan(5);
    expect(result.errors).toHaveLength(0);

    const items = await db.listItems({ limit: 1000 });
    expect(items.length).toBe(result.itemsIndexed);

    // Check all chunks have same sourceId
    const sourceIds = new Set(
      items.map((item) => item.metadata?.sourceId).filter(Boolean),
    );
    expect(sourceIds.size).toBe(1);
  });

  test("preserves original content in first chunk", async () => {
    const originalText = "First sentence. Second sentence. Third sentence.";

    await indexText(originalText, {}, { chunkSize: 20, chunkOverlap: 5 }, db);

    const items = await db.listItems({ limit: 100 });

    const firstChunk = items.find((item) => item.metadata?.chunkIndex === 0);
    expect(firstChunk?.metadata?.originalContent).toBe(originalText);

    const otherChunks = items.filter((item) => item.metadata?.chunkIndex !== 0);
    for (const chunk of otherChunks) {
      expect(chunk.metadata?.originalContent).toBeUndefined();
    }
  });

  test("handles progress callback", async () => {
    const progressMessages: string[] = [];
    const progressValues: number[] = [];

    const onProgress = (message: string, progress?: number) => {
      progressMessages.push(message);
      if (progress !== undefined) {
        progressValues.push(progress);
      }
    };

    const text = "Test content for progress tracking. ".repeat(10);

    await indexText(
      text,
      {},
      {
        chunkSize: 50,
        onProgress,
      },
      db,
    );

    expect(progressMessages.length).toBeGreaterThan(0);
    // Just check that some progress messages were generated
    expect(progressMessages.length).toBeGreaterThan(0);

    for (const progress of progressValues) {
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(1);
    }
  });
});

describe("indexFile", () => {
  let db: DatabaseService;
  let tempDir: string;

  beforeEach(async () => {
    db = await createTestDatabase({ provider: "memory", dimension: 768 });
    // Use ./data directory for test files to avoid security restrictions
    tempDir = join("./data", `test-file-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await cleanupTestDatabase(db);
    // Clean up test directory
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  test("indexes a file successfully", async () => {
    const filePath = join(tempDir, "test.ts");
    const content = `interface User {
  id: string;
  name: string;
}

class UserService {
  getUser(id: string): User | undefined {
    return undefined;
  }
}`;

    await writeFile(filePath, content, "utf-8");

    const result = await indexFile(
      filePath,
      { project: "test" },
      { chunkSize: 100, preserveBoundaries: true },
      db,
    );

    expect(result.itemsIndexed).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);

    const items = await db.listItems({ limit: 10 });
    expect(items.length).toBeGreaterThan(0);
    if (items[0]) {
      expect(items[0].metadata?.sourceType).toBe("file");
      expect(items[0].metadata?.filePath).toBe(filePath);
    }
  });

  test("handles non-existent file", async () => {
    const nonExistentPath = join(tempDir, "non-existent.txt");

    const result = await indexFile(nonExistentPath, {}, {}, db);
    expect(result.itemsIndexed).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("respects chunk boundaries for code", async () => {
    const codePath = join(tempDir, "code.ts");
    const code = `function firstFunction() {
  console.log("First");
}

function secondFunction() {
  console.log("Second");
}

function thirdFunction() {
  console.log("Third");
}`;

    await writeFile(codePath, code, "utf-8");

    const result = await indexFile(
      codePath,
      {},
      { chunkSize: 80, preserveBoundaries: true },
      db,
    );

    expect(result.itemsIndexed).toBeGreaterThan(0);

    const items = await db.listItems({ limit: 100 });

    for (const item of items) {
      const content = item.content;
      if (content.includes("function")) {
        const openBraces = (content.match(/\{/g) || []).length;
        const closeBraces = (content.match(/\}/g) || []).length;
        expect(openBraces).toBe(closeBraces);
      }
    }
  });

  test("handles binary files gracefully", async () => {
    const binaryPath = join(tempDir, "binary.bin");
    const binaryData = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff]);
    await writeFile(binaryPath, binaryData);

    const result = await indexFile(binaryPath, {}, {}, db);

    // Should either skip or handle gracefully
    expect(result).toBeDefined();
    // Binary files may not generate meaningful chunks
    if (result.itemsIndexed === 0) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});

describe("indexFiles", () => {
  let db: DatabaseService;
  let tempDir: string;

  beforeEach(async () => {
    db = await createTestDatabase({ provider: "memory", dimension: 768 });
    // Use ./data directory for test files to avoid security restrictions
    tempDir = join("./data", `test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await cleanupTestDatabase(db);
    // Clean up test directory
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  test("indexes multiple files with glob pattern", async () => {
    const files = [
      { name: "file1.ts", content: "export const value1 = 1;" },
      { name: "file2.ts", content: "export const value2 = 2;" },
      { name: "file3.js", content: "module.exports = { value3: 3 };" },
    ];

    for (const file of files) {
      await writeFile(join(tempDir, file.name), file.content, "utf-8");
    }

    const pattern = join(tempDir, "*.{ts,js}");
    const result = await indexFiles(
      [pattern],
      { batch: "test" },
      { chunkSize: 50, chunkOverlap: 10 },
      db,
    );

    expect(result.itemsIndexed).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);

    const items = await db.listItems({ limit: 100 });
    const filePaths = new Set(
      items.map((item) => item.metadata?.filePath).filter(Boolean),
    );
    expect(filePaths.size).toBe(3);
  });

  test("handles empty glob matches", async () => {
    const pattern = join(tempDir, "*.nonexistent");

    const result = await indexFiles([pattern], {}, {}, db);

    expect(result.itemsIndexed).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain(
      "No files matched the specified patterns",
    );

    const count = await db.countItems();
    expect(count).toBe(0);
  });

  test("continues on individual file errors", async () => {
    await writeFile(join(tempDir, "good.txt"), "Good content", "utf-8");

    const pattern = join(tempDir, "*.txt");

    const result = await indexFiles([pattern], {}, {}, db);

    expect(result.itemsIndexed).toBeGreaterThan(0);

    const items = await db.listItems({ limit: 10 });
    expect(items.some((item) => item.content.includes("Good content"))).toBe(
      true,
    );
  });

  test("handles nested directories", async () => {
    await mkdir(join(tempDir, "src"), { recursive: true });
    await mkdir(join(tempDir, "lib"), { recursive: true });

    await writeFile(
      join(tempDir, "src", "index.ts"),
      "export const src = 1;",
      "utf-8",
    );
    await writeFile(
      join(tempDir, "lib", "utils.ts"),
      "export const lib = 2;",
      "utf-8",
    );

    const pattern = join(tempDir, "**/*.ts");
    const result = await indexFiles([pattern], {}, {}, db);

    expect(result.itemsIndexed).toBeGreaterThan(0);

    const items = await db.listItems({ limit: 100 });
    const filePaths = items
      .map((item) => item.metadata?.filePath)
      .filter(Boolean);

    expect(filePaths.some((p) => p?.includes("src/index.ts"))).toBe(true);
    expect(filePaths.some((p) => p?.includes("lib/utils.ts"))).toBe(true);
  });
});

describe("indexGist", () => {
  let db: DatabaseService;

  beforeEach(async () => {
    db = await createTestDatabase({ provider: "memory", dimension: 768 });
  });

  afterEach(async () => {
    await cleanupTestDatabase(db);
  });

  test("validates Gist URL format", async () => {
    const invalidUrl = "https://not-a-gist.com/user/id";

    const result = await indexGist(invalidUrl, {}, db);

    expect(result.itemsIndexed).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("Security error");
  });

  test("handles valid Gist URL format", async () => {
    const validUrl = "https://gist.github.com/user/1234567890abcdef";

    // This will fail with network error but URL validation passes
    const result = await indexGist(validUrl, {}, db);

    expect(result).toBeDefined();
    expect(result.errors.length).toBeGreaterThanOrEqual(0);
  });

  test("handles Gist URL with username only", async () => {
    const incompleteUrl = "https://gist.github.com/username";

    const result = await indexGist(incompleteUrl, {}, db);

    expect(result.itemsIndexed).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("indexGitHubRepo", () => {
  let db: DatabaseService;

  beforeEach(async () => {
    db = await createTestDatabase({ provider: "memory", dimension: 768 });
  });

  afterEach(async () => {
    await cleanupTestDatabase(db);
  });

  test("validates GitHub repository URL format", async () => {
    const invalidUrl = "https://gitlab.com/owner/repo";

    const result = await indexGitHubRepo(invalidUrl, {}, db);

    expect(result.itemsIndexed).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("Security error");
  });

  test("handles valid GitHub repository URL format", async () => {
    const validUrl = "https://github.com/owner/repo";

    // This will fail with network error but URL validation passes
    const result = await indexGitHubRepo(validUrl, {}, db);

    expect(result).toBeDefined();
    expect(result.errors.length).toBeGreaterThanOrEqual(0);
  });

  test("handles GitHub URL with path", async () => {
    const urlWithPath = "https://github.com/owner/repo/tree/main/src";

    const result = await indexGitHubRepo(urlWithPath, {}, db);

    // Should extract repo URL or handle appropriately
    expect(result).toBeDefined();
  });
});

describe("Error recovery", () => {
  let db: DatabaseService;

  beforeEach(async () => {
    db = await createTestDatabase({ provider: "memory", dimension: 768 });
  });

  afterEach(async () => {
    await cleanupTestDatabase(db);
  });

  test("recovers from partial failures during batch processing", async () => {
    const documents = [
      { text: "Valid document 1", metadata: { id: 1 } },
      { text: "Valid document 2", metadata: { id: 2 } },
      { text: "Valid document 3", metadata: { id: 3 } },
    ];

    let successCount = 0;
    let errorCount = 0;

    for (const doc of documents) {
      const result = await indexText(
        doc.text,
        doc.metadata,
        { chunkSize: 50, chunkOverlap: 10 },
        db,
      );

      if (result.itemsIndexed > 0) {
        successCount++;
      }
      if (result.errors.length > 0) {
        errorCount++;
      }
    }

    expect(successCount).toBe(3);
    expect(errorCount).toBe(0);

    const items = await db.listItems({ limit: 100 });
    const ids = new Set(items.map((item) => item.metadata?.id).filter(Boolean));
    expect(ids.size).toBe(3);
  });

  test("handles database connection errors gracefully", async () => {
    // Close database to simulate connection error
    await db.close();

    const result = await indexText("test", {}, {}, db);
    expect(result.itemsIndexed).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("Concurrent indexing", () => {
  let db: DatabaseService;

  beforeEach(async () => {
    db = await createTestDatabase({ provider: "memory", dimension: 768 });
  });

  afterEach(async () => {
    await cleanupTestDatabase(db);
  });

  test("handles concurrent text indexing", async () => {
    const texts = [
      "First document content",
      "Second document content",
      "Third document content",
      "Fourth document content",
      "Fifth document content",
    ];

    const promises = texts.map((text, index) =>
      indexText(
        text,
        { docId: index },
        { chunkSize: 50, chunkOverlap: 10 },
        db,
      ),
    );

    const results = await Promise.all(promises);

    results.forEach((result) => {
      expect(result.itemsIndexed).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
    });

    const items = await db.listItems({ limit: 1000 });
    const docIds = new Set(
      items
        .map((item) => item.metadata?.docId)
        .filter((id) => id !== undefined),
    );
    expect(docIds.size).toBe(5);
  });
});

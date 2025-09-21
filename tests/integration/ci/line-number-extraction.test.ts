import { rm } from "node:fs/promises";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createDatabaseService,
  type DatabaseService,
} from "../../../src/core/database/database-service.js";
import { indexFiles } from "../../../src/core/indexer/indexer.js";
import { hybridSearch } from "../../../src/core/search/search.js";

describe("Line number extraction integration test", () => {
  const testDbPath = "./test-line-numbers.db";
  let db: DatabaseService;

  beforeEach(async () => {
    // Clean up previous test database
    await rm(testDbPath, { force: true });

    // Create fresh database
    db = createDatabaseService();
    await db.initialize({
      provider: "sqlite",
      options: { path: testDbPath },
    });
  });

  it("should preserve line numbers in chunk metadata", async () => {
    // Create a test markdown file content
    const testContent = `# Test Document

## Section 1
This is the first section with some content.
It has multiple lines.

## Section 2
This section contains important keywords.
We'll search for these: documentation, impact, analysis.

## Section 3
More content here.
Final section.`;

    // Write test file
    const { writeFile } = await import("node:fs/promises");
    await writeFile("test-doc.md", testContent);

    try {
      // Index the file with boundary preservation
      const result = await indexFiles(
        ["test-doc.md"],
        {}, // metadata
        {
          // options
          chunkSize: 200, // Small chunks to force multiple chunks
          chunkOverlap: 50,
          preserveBoundaries: true,
        },
        db,
      );

      expect(result.itemsIndexed).toBeGreaterThan(0);

      // Search for content
      const searchResults = await hybridSearch(
        "documentation impact analysis",
        { k: 5, keywordWeight: 0.3 },
        db,
      );

      console.log("Search results:", JSON.stringify(searchResults, null, 2));

      // Check if any results have line number metadata
      const hasLineNumbers = searchResults.some((result) => {
        const boundary = result.metadata?.boundary as
          | {
              startLine?: number;
              endLine?: number;
              type?: string;
              level?: number;
            }
          | undefined;
        const directStartLine = result.metadata?.startLine;
        const directEndLine = result.metadata?.endLine;

        console.log("Result metadata:", {
          file: result.metadata?.filePath,
          boundary,
          directStartLine,
          directEndLine,
        });

        return (
          (boundary?.startLine && boundary?.endLine) ||
          (directStartLine && directEndLine)
        );
      });

      // This should be true if line numbers are properly preserved
      expect(hasLineNumbers).toBe(true);

      // Check specific metadata structure
      if (searchResults.length > 0) {
        const firstResult = searchResults[0];
        const metadata = firstResult?.metadata;

        console.log("First result full metadata:", metadata);

        // Check for boundary structure
        if (metadata?.boundary) {
          const boundary = metadata.boundary as {
            startLine?: number;
            endLine?: number;
          };
          expect(boundary).toHaveProperty("startLine");
          expect(boundary).toHaveProperty("endLine");
          expect(typeof boundary.startLine).toBe("number");
          expect(typeof boundary.endLine).toBe("number");
        }
      }
    } finally {
      // Clean up test file
      await rm("test-doc.md", { force: true });
      await db.close();
      await rm(testDbPath, { force: true });
    }
  });

  it("should preserve line numbers for code files", async () => {
    const testCode = `function example() {
  // Line 2
  console.log("test");
}

class MyClass {
  // Line 7
  constructor() {
    this.value = 42;
  }

  method() {
    // Line 13
    return this.value;
  }
}

export { example, MyClass };`;

    // Write test file
    const { writeFile } = await import("node:fs/promises");
    await writeFile("test-code.ts", testCode);

    try {
      // Index the file with boundary preservation
      const result = await indexFiles(
        ["test-code.ts"],
        {}, // metadata
        {
          // options
          chunkSize: 500,
          chunkOverlap: 50,
          preserveBoundaries: true,
        },
        db,
      );

      expect(result.itemsIndexed).toBeGreaterThan(0);

      // Search for content
      const searchResults = await hybridSearch(
        "MyClass constructor",
        { k: 5, keywordWeight: 0.3 },
        db,
      );

      console.log(
        "Code search results:",
        JSON.stringify(searchResults, null, 2),
      );

      // Check for line numbers
      const hasLineNumbers = searchResults.some((result) => {
        const boundary = result.metadata?.boundary as
          | {
              startLine?: number;
              endLine?: number;
            }
          | undefined;
        return boundary?.startLine && boundary?.endLine;
      });

      expect(hasLineNumbers).toBe(true);
    } finally {
      // Clean up
      await rm("test-code.ts", { force: true });
      await db.close();
      await rm(testDbPath, { force: true });
    }
  });
});

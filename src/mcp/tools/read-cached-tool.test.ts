import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { handleReadCachedTool } from "./read-cached-tool.js";

// Mock getCacheDir to use a test directory
mock.module("../utils/cache-utils.js", () => ({
  getCacheDir: () => join(process.cwd(), "test-cache"),
}));

describe("handleReadCachedTool", () => {
  const testCacheDir = join(process.cwd(), "test-cache");
  const queriesPath = join(testCacheDir, "queries.md");
  const structuredDir = join(testCacheDir, "structured");

  beforeEach(() => {
    // Create test cache directory structure
    mkdirSync(testCacheDir, { recursive: true });
    mkdirSync(structuredDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test cache directory
    rmSync(testCacheDir, { recursive: true, force: true });
  });

  it("should return empty result when no cache exists", async () => {
    const result = await handleReadCachedTool({ type: "all" });

    expect(result.success).toBe(true);
    expect(result.message).toBe("No cached content found");
    expect(result.queries).toBeNull();
    expect(result.knowledge).toEqual([]);
  });

  it("should read queries.md when type is queries", async () => {
    const queriesContent = "# Cached Queries\n\n- Query 1\n- Query 2";
    writeFileSync(queriesPath, queriesContent);

    const result = await handleReadCachedTool({ type: "queries" });

    expect(result.success).toBe(true);
    expect(result.message).toBe("Found cached queries");
    expect(result.queries).toBe(queriesContent);
    expect(result.knowledge).toEqual([]);
  });

  it("should read structured knowledge when type is knowledge", async () => {
    const knowledge1 = "# Topic 1\n\nContent for topic 1";
    const knowledge2 = "# Topic 2\n\nContent for topic 2";
    writeFileSync(join(structuredDir, "topic_1.md"), knowledge1);
    writeFileSync(join(structuredDir, "topic_2.md"), knowledge2);

    const result = await handleReadCachedTool({ type: "knowledge" });

    expect(result.success).toBe(true);
    expect(result.message).toBe("Found 2 knowledge documents");
    expect(result.queries).toBeNull();
    expect(result.knowledge).toHaveLength(2);
    expect(result.knowledge?.[0]).toEqual({
      file: "topic_1.md",
      topic: "topic 1",
      content: knowledge1,
    });
    expect(result.knowledge?.[1]).toEqual({
      file: "topic_2.md",
      topic: "topic 2",
      content: knowledge2,
    });
  });

  it("should read both queries and knowledge when type is all", async () => {
    const queriesContent = "# Cached Queries\n\nTest queries";
    const knowledgeContent = "# Test Knowledge\n\nTest content";
    writeFileSync(queriesPath, queriesContent);
    writeFileSync(join(structuredDir, "test_knowledge.md"), knowledgeContent);

    const result = await handleReadCachedTool({ type: "all" });

    expect(result.success).toBe(true);
    expect(result.message).toBe(
      "Found 1 knowledge documents and cached queries",
    );
    expect(result.queries).toBe(queriesContent);
    expect(result.knowledge).toHaveLength(1);
    expect(result.knowledge?.[0]).toEqual({
      file: "test_knowledge.md",
      topic: "test knowledge",
      content: knowledgeContent,
    });
  });

  it("should filter knowledge by topic when topic is specified", async () => {
    writeFileSync(
      join(structuredDir, "typescript_tips.md"),
      "# TypeScript Tips",
    );
    writeFileSync(join(structuredDir, "python_guide.md"), "# Python Guide");
    writeFileSync(
      join(structuredDir, "typescript_advanced.md"),
      "# TypeScript Advanced",
    );

    const result = await handleReadCachedTool({
      type: "knowledge",
      topic: "typescript",
    });

    expect(result.success).toBe(true);
    expect(result.knowledge).toHaveLength(2);
    const files = result.knowledge?.map((k) => k.file).sort();
    expect(files).toEqual(["typescript_advanced.md", "typescript_tips.md"]);
  });

  it("should handle invalid input parameters", async () => {
    const result = await handleReadCachedTool({
      type: "invalid",
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("Invalid input parameters");
  });

  it("should ignore non-markdown files in structured directory", async () => {
    writeFileSync(join(structuredDir, "valid.md"), "# Valid");
    writeFileSync(join(structuredDir, "invalid.txt"), "Invalid");
    writeFileSync(join(structuredDir, "also_invalid.json"), "{}");

    const result = await handleReadCachedTool({ type: "knowledge" });

    expect(result.success).toBe(true);
    expect(result.knowledge).toHaveLength(1);
    expect(result.knowledge?.[0]?.file).toBe("valid.md");
  });

  it("should use 'all' as default type when not specified", async () => {
    writeFileSync(queriesPath, "Queries");
    writeFileSync(join(structuredDir, "knowledge.md"), "Knowledge");

    const result = await handleReadCachedTool({});

    expect(result.success).toBe(true);
    expect(result.queries).toBe("Queries");
    expect(result.knowledge).toHaveLength(1);
  });
});

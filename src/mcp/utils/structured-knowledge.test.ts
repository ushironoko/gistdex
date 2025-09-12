import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadStructuredKnowledge,
  mergeKnowledge,
  type StructuredKnowledge,
  saveStructuredKnowledge,
  updateStructuredKnowledge,
} from "./structured-knowledge.js";

describe("structured-knowledge", () => {
  const testDir = join(process.cwd(), ".gistdex-test", "cache");
  const testTopic = "test-topic";

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(join(process.cwd(), ".gistdex-test"), {
      recursive: true,
      force: true,
    });
  });

  describe("saveStructuredKnowledge", () => {
    it("should save structured knowledge to markdown file", async () => {
      const knowledge: Omit<StructuredKnowledge, "lastUpdated"> = {
        topic: testTopic,
        content: "# Test Topic\n\nThis is test content.",
        metadata: {
          source: "test",
          queries: ["query1", "query2"],
        },
      };

      await saveStructuredKnowledge(knowledge, testDir);

      const sanitizedTopic = testTopic.replace(/\s+/g, "_");
      const filePath = join(testDir, `${sanitizedTopic}.md`);
      const savedContent = await readFile(filePath, "utf-8");

      expect(savedContent).toContain("# Test Topic");
      expect(savedContent).toContain("This is test content");
      expect(savedContent).toContain("## Metadata");
      expect(savedContent).toContain("Source: test");
      expect(savedContent).toContain("Queries: query1, query2");
    });

    it("should overwrite existing file when saving", async () => {
      const knowledge1: Omit<StructuredKnowledge, "lastUpdated"> = {
        topic: testTopic,
        content: "First content",
        metadata: { version: 1 },
      };

      const knowledge2: Omit<StructuredKnowledge, "lastUpdated"> = {
        topic: testTopic,
        content: "Second content",
        metadata: { version: 2 },
      };

      await saveStructuredKnowledge(knowledge1, testDir);
      await saveStructuredKnowledge(knowledge2, testDir);

      const sanitizedTopic = testTopic.replace(/\s+/g, "_");
      const filePath = join(testDir, `${sanitizedTopic}.md`);
      const savedContent = await readFile(filePath, "utf-8");

      expect(savedContent).toContain("Second content");
      expect(savedContent).not.toContain("First content");
    });
  });

  describe("updateStructuredKnowledge", () => {
    it("should update existing knowledge by merging content", async () => {
      const initial: Omit<StructuredKnowledge, "lastUpdated"> = {
        topic: testTopic,
        content: "# Initial\n\n## Section 1\nInitial content",
        metadata: { queries: ["query1"] },
      };

      await saveStructuredKnowledge(initial, testDir);

      const update = {
        content: "\n## Section 2\nAdditional content",
        metadata: { queries: ["query2"] },
      };

      await updateStructuredKnowledge(testTopic, update, testDir);

      const updated = await loadStructuredKnowledge(testTopic, testDir);
      expect(updated).not.toBeNull();
      expect(updated?.content).toContain("## Section 1");
      expect(updated?.content).toContain("## Section 2");
      expect(updated?.content).toContain("Update:");
      expect(updated?.metadata.queries).toEqual(["query1", "query2"]);
    });

    it("should create new file if topic doesn't exist", async () => {
      const update = {
        content: "# New Topic\nNew content",
        metadata: { source: "new" },
      };

      await updateStructuredKnowledge("new-topic", update, testDir);

      const created = await loadStructuredKnowledge("new-topic", testDir);
      expect(created).not.toBeNull();
      expect(created?.content).toContain("New content");
    });
  });

  describe("loadStructuredKnowledge", () => {
    it("should load saved knowledge from file", async () => {
      const knowledge: Omit<StructuredKnowledge, "lastUpdated"> = {
        topic: testTopic,
        content: "# Test\nContent here",
        metadata: { key: "value" },
      };

      await saveStructuredKnowledge(knowledge, testDir);

      const loaded = await loadStructuredKnowledge(testTopic, testDir);
      expect(loaded).not.toBeNull();
      expect(loaded?.topic).toBe(testTopic);
      expect(loaded?.content).toContain("Content here");
      expect(loaded?.metadata.key).toBe("value");
      expect(loaded?.lastUpdated).toBeDefined();
    });

    it("should return null if file doesn't exist", async () => {
      const loaded = await loadStructuredKnowledge("non-existent", testDir);
      expect(loaded).toBeNull();
    });
  });

  describe("mergeKnowledge", () => {
    it("should merge two knowledge objects", () => {
      const existing: StructuredKnowledge = {
        topic: "test",
        content: "# Test\n## Section 1\nExisting",
        metadata: { queries: ["q1"], count: 1 },
        lastUpdated: "2024-01-01",
      };

      const update = {
        content: "\n## Section 2\nNew",
        metadata: { queries: ["q2"], count: 1 },
      };

      const merged = mergeKnowledge(existing, update);
      expect(merged.content).toContain("## Section 1");
      expect(merged.content).toContain("## Section 2");
      expect(merged.metadata.queries).toEqual(["q1", "q2"]);
      expect(merged.metadata.count).toBe(2);
    });

    it("should handle empty metadata gracefully", () => {
      const existing: StructuredKnowledge = {
        topic: "test",
        content: "Existing",
        metadata: {},
        lastUpdated: "2024-01-01",
      };

      const update = {
        content: " New",
        metadata: { key: "value" },
      };

      const merged = mergeKnowledge(existing, update);
      // smartMergeContent adds separator between content
      expect(merged.content).toContain("Existing");
      expect(merged.content).toContain("New");
      expect(merged.content).toContain("Update:");
      expect(merged.metadata.key).toBe("value");
    });
  });
});

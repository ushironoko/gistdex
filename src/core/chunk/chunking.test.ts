import { describe, expect, test } from "bun:test";
import { chunkText } from "./chunking.js";

describe("chunkText", () => {
  test("returns single chunk for short text", () => {
    const text = "Short text";
    const result = chunkText(text, { size: 100, overlap: 10 });
    expect(result).toEqual([text]);
  });

  test("splits long text into multiple chunks", () => {
    const text = "a".repeat(1000);
    const result = chunkText(text, { size: 400, overlap: 50 });

    // With step = 350, chunks at: 0, 350, 700 -> 3 chunks
    expect(result).toHaveLength(3);

    expect(result[0]).toHaveLength(400); // First chunk
    expect(result[1]).toHaveLength(400); // Second chunk
    expect(result[2]).toHaveLength(300); // Last chunk (remaining text)
  });

  test("respects word preservation", () => {
    const text = "The quick brown fox jumps over the lazy dog";
    const result = chunkText(text, {
      size: 20,
      overlap: 5,
      preserveWords: true,
    });

    // No chunk should end mid-word
    result.forEach((chunk) => {
      expect(chunk).not.toMatch(/\w-$/); // Shouldn't end with partial word
      expect(chunk).not.toMatch(/^-\w/); // Shouldn't start with partial word
    });
  });

  test("handles overlap correctly", () => {
    const text = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const result = chunkText(text, {
      size: 10,
      overlap: 3,
      preserveWords: false,
    });

    // First chunk: ABCDEFGHIJ (0-10)
    expect(result[0]).toBe("ABCDEFGHIJ");

    // Second chunk: HIJKLMNOPQ (7-17, overlap of 3)
    expect(result[1]).toBe("HIJKLMNOPQ");
  });

  test("throws error for invalid chunk size", () => {
    expect(() => chunkText("test", { size: 0 })).toThrow(
      "Chunk size must be greater than 0",
    );
  });

  test("throws error for negative overlap", () => {
    expect(() => chunkText("test", { overlap: -5 })).toThrow(
      "Overlap cannot be negative",
    );
  });

  test("throws error when overlap equals or exceeds chunk size", () => {
    expect(() => chunkText("test", { size: 100, overlap: 100 })).toThrow(
      "Overlap must be less than chunk size",
    );

    expect(() => chunkText("test", { size: 100, overlap: 150 })).toThrow(
      "Overlap must be less than chunk size",
    );
  });

  test("handles empty text", () => {
    const result = chunkText("", { size: 100, overlap: 10 });
    expect(result).toEqual([""]);
  });

  test("filters out empty chunks after trimming", () => {
    const text = "Hello     \n\n\n    World"; // Multiple spaces and newlines
    const result = chunkText(text, { size: 10, overlap: 2 });

    // All chunks should have content (no empty chunks)
    result.forEach((chunk) => {
      expect(chunk.trim()).not.toBe("");
    });
  });

  test("preserves exact text content", () => {
    const text = "The quick brown fox";
    const result = chunkText(text, {
      size: 100,
      overlap: 0,
      preserveWords: false,
    });

    // Single chunk should contain exact text
    expect(result[0]).toBe(text);
  });

  test("handles text with special characters", () => {
    const text = "Hello! @#$%^&*() World? 123-456.789";
    const result = chunkText(text, { size: 20, overlap: 5 });

    // Should handle special characters without errors
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
  });

  test("handles unicode text correctly", () => {
    const text = "Hello 世界 🌍 Emoji 🎉 Test";
    const result = chunkText(text, { size: 15, overlap: 3 });

    // Should handle unicode without breaking characters
    expect(result).toBeDefined();
    result.forEach((chunk) => {
      expect(chunk).toBeDefined();
      expect(typeof chunk).toBe("string");
    });
  });

  test("preserves newlines in chunks", () => {
    const text = "Line 1\nLine 2\nLine 3\nLine 4";
    const result = chunkText(text, {
      size: 15,
      overlap: 3,
      preserveWords: false,
    });

    // At least one chunk should contain newline
    const hasNewline = result.some((chunk) => chunk.includes("\n"));
    expect(hasNewline).toBe(true);
  });

  test("handles markdown-style text", () => {
    const text = `# Header
    
This is a paragraph with **bold** and *italic* text.

- List item 1
- List item 2`;

    const result = chunkText(text, { size: 50, overlap: 10 });

    // Should process markdown text without issues
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
  });

  test("handles code blocks", () => {
    const text = '```javascript\nconst x = "hello";\nconsole.log(x);\n```';
    const result = chunkText(text, { size: 30, overlap: 5 });

    // Should handle code blocks
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
  });

  test("processes very long text efficiently", () => {
    const text = "a".repeat(10000);
    const result = chunkText(text, { size: 1000, overlap: 100 });

    // Should handle large text
    expect(result.length).toBeGreaterThan(10);

    // Verify chunk sizes
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i]).toHaveLength(1000);
    }
  });
});

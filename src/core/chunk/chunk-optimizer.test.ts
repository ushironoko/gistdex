import { describe, expect, it } from "bun:test";
import {
  type ChunkSettings,
  getOptimalChunkSettings,
} from "./chunk-optimizer.js";

describe("chunk-optimizer", () => {
  describe("getOptimalChunkSettings", () => {
    it("should return optimal settings for code files (.js, .ts)", () => {
      const jsSettings = getOptimalChunkSettings("file.js");
      expect(jsSettings).toEqual({
        chunkSize: 650,
        chunkOverlap: 125,
      } as const satisfies ChunkSettings);

      const tsSettings = getOptimalChunkSettings("path/to/file.ts");
      expect(tsSettings).toEqual({
        chunkSize: 650,
        chunkOverlap: 125,
      } as const satisfies ChunkSettings);
    });

    it("should return optimal settings for Python files", () => {
      const settings = getOptimalChunkSettings("script.py");
      expect(settings).toEqual({
        chunkSize: 650,
        chunkOverlap: 125,
      } as const satisfies ChunkSettings);
    });

    it("should return optimal settings for Java files", () => {
      const settings = getOptimalChunkSettings("Main.java");
      expect(settings).toEqual({
        chunkSize: 650,
        chunkOverlap: 125,
      } as const satisfies ChunkSettings);
    });

    it("should return optimal settings for documentation files (.md)", () => {
      const settings = getOptimalChunkSettings("README.md");
      expect(settings).toEqual({
        chunkSize: 1250,
        chunkOverlap: 250,
      } as const satisfies ChunkSettings);
    });

    it("should return optimal settings for text/article files", () => {
      const txtSettings = getOptimalChunkSettings("article.txt");
      expect(txtSettings).toEqual({
        chunkSize: 1750,
        chunkOverlap: 350,
      } as const satisfies ChunkSettings);
    });

    it("should return optimal settings for HTML files", () => {
      const settings = getOptimalChunkSettings("index.html");
      expect(settings).toEqual({
        chunkSize: 1250,
        chunkOverlap: 250,
      } as const satisfies ChunkSettings);
    });

    it("should return default settings for unknown extensions", () => {
      const settings = getOptimalChunkSettings("file.unknown");
      expect(settings).toEqual({
        chunkSize: 1000,
        chunkOverlap: 200,
      } as const satisfies ChunkSettings);
    });

    it("should handle files without extensions", () => {
      const settings = getOptimalChunkSettings("Dockerfile");
      expect(settings).toEqual({
        chunkSize: 1000,
        chunkOverlap: 200,
      } as const satisfies ChunkSettings);
    });

    it("should handle complex file paths", () => {
      const settings = getOptimalChunkSettings(
        "/home/user/projects/my.project/src/components/Button.tsx",
      );
      expect(settings).toEqual({
        chunkSize: 650,
        chunkOverlap: 125,
      } as const satisfies ChunkSettings);
    });

    it("should be case-insensitive for extensions", () => {
      const upperSettings = getOptimalChunkSettings("File.JS");
      expect(upperSettings).toEqual({
        chunkSize: 650,
        chunkOverlap: 125,
      } as const satisfies ChunkSettings);

      const mixedSettings = getOptimalChunkSettings("Document.Md");
      expect(mixedSettings).toEqual({
        chunkSize: 1250,
        chunkOverlap: 250,
      } as const satisfies ChunkSettings);
    });

    it("should handle JSON and YAML config files", () => {
      const jsonSettings = getOptimalChunkSettings("config.json");
      expect(jsonSettings).toEqual({
        chunkSize: 650,
        chunkOverlap: 125,
      } as const satisfies ChunkSettings);

      const yamlSettings = getOptimalChunkSettings("config.yml");
      expect(yamlSettings).toEqual({
        chunkSize: 650,
        chunkOverlap: 125,
      } as const satisfies ChunkSettings);
    });

    it("should handle CSS files", () => {
      const settings = getOptimalChunkSettings("styles.css");
      expect(settings).toEqual({
        chunkSize: 650,
        chunkOverlap: 125,
      } as const satisfies ChunkSettings);
    });

    it("should handle Ruby files", () => {
      const settings = getOptimalChunkSettings("script.rb");
      expect(settings).toEqual({
        chunkSize: 650,
        chunkOverlap: 125,
      } as const satisfies ChunkSettings);
    });

    it("should handle Go files", () => {
      const settings = getOptimalChunkSettings("main.go");
      expect(settings).toEqual({
        chunkSize: 650,
        chunkOverlap: 125,
      } as const satisfies ChunkSettings);
    });

    it("should handle Rust files", () => {
      const settings = getOptimalChunkSettings("main.rs");
      expect(settings).toEqual({
        chunkSize: 650,
        chunkOverlap: 125,
      } as const satisfies ChunkSettings);
    });
  });
});

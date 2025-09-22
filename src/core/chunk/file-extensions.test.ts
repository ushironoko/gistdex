import { describe, expect, it } from "bun:test";
import {
  isCodeFile,
  isMarkdownFile,
  isTextFile,
  isTreeSitterSupported,
} from "./file-extensions.js";

describe("file-extensions", () => {
  describe("isTextFile", () => {
    it("should correctly identify text files by filename", () => {
      expect(isTextFile("test.txt")).toBe(true);
      expect(isTextFile("README.md")).toBe(true);
      expect(isTextFile("component.tsx")).toBe(true);
      expect(isTextFile("script.py")).toBe(true);
      expect(isTextFile("config.yaml")).toBe(true);
      expect(isTextFile("example.example")).toBe(true);
    });

    it("should correctly identify text files by extension", () => {
      expect(isTextFile(".txt")).toBe(true);
      expect(isTextFile(".md")).toBe(true);
      expect(isTextFile(".tsx")).toBe(true);
      expect(isTextFile(".py")).toBe(true);
      expect(isTextFile(".yaml")).toBe(true);
    });

    it("should return false for unsupported extensions", () => {
      expect(isTextFile("image.png")).toBe(false);
      expect(isTextFile("video.mp4")).toBe(false);
      expect(isTextFile("archive.zip")).toBe(false);
      expect(isTextFile(".png")).toBe(false);
      expect(isTextFile(".mp4")).toBe(false);
    });

    it("should be case-insensitive", () => {
      expect(isTextFile("TEST.TXT")).toBe(true);
      expect(isTextFile("README.MD")).toBe(true);
      expect(isTextFile(".TXT")).toBe(true);
      expect(isTextFile(".MD")).toBe(true);
    });
  });

  describe("isMarkdownFile", () => {
    it("should identify markdown files", () => {
      expect(isMarkdownFile(".md")).toBe(true);
      expect(isMarkdownFile(".mdx")).toBe(true);
      expect(isMarkdownFile(".txt")).toBe(false);
    });
  });

  describe("isCodeFile", () => {
    it("should identify code files", () => {
      expect(isCodeFile(".js")).toBe(true);
      expect(isCodeFile(".py")).toBe(true);
      expect(isCodeFile(".go")).toBe(true);
      expect(isCodeFile(".rs")).toBe(true);
      expect(isCodeFile(".txt")).toBe(false);
      expect(isCodeFile(".md")).toBe(false);
    });
  });

  describe("isTreeSitterSupported", () => {
    it("should identify tree-sitter supported files", () => {
      expect(isTreeSitterSupported(".js")).toBe(true);
      expect(isTreeSitterSupported(".ts")).toBe(true);
      expect(isTreeSitterSupported(".py")).toBe(true);
      expect(isTreeSitterSupported(".go")).toBe(true);
      expect(isTreeSitterSupported(".html")).toBe(true);
      expect(isTreeSitterSupported(".css")).toBe(true);
    });
  });
});

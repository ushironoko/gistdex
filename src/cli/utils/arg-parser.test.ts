import { describe, expect, it } from "bun:test";
import {
  parseCliBoolean,
  parseCliInteger,
  parseCliStringArray,
} from "./arg-parser.js";

describe("CLI Argument Parser", () => {
  describe("parseCliInteger", () => {
    it("should parse CLI integer arguments", () => {
      expect(parseCliInteger("42")).toBe(42);
      expect(parseCliInteger("0")).toBe(0);
      expect(parseCliInteger("-10")).toBe(-10);
    });

    it("should return default for invalid input", () => {
      expect(parseCliInteger(undefined, 100)).toBe(100);
      expect(parseCliInteger("abc", 50)).toBe(50);
      expect(parseCliInteger("", 75)).toBe(75);
    });

    it("should handle string | boolean | undefined union type", () => {
      const value: string | boolean | undefined = "123";
      expect(parseCliInteger(value)).toBe(123);
    });
  });

  describe("parseCliBoolean", () => {
    it("should parse CLI boolean arguments", () => {
      expect(parseCliBoolean("true")).toBe(true);
      expect(parseCliBoolean("false")).toBe(false);
      expect(parseCliBoolean(true)).toBe(true);
      expect(parseCliBoolean(false)).toBe(false);
    });

    it("should return default for invalid input", () => {
      expect(parseCliBoolean(undefined, true)).toBe(true);
      expect(parseCliBoolean("invalid", false)).toBe(false);
    });
  });

  describe("parseCliStringArray", () => {
    it("should parse comma-separated CLI arguments", () => {
      expect(parseCliStringArray("a,b,c")).toEqual(["a", "b", "c"]);
      expect(parseCliStringArray("path1, path2")).toEqual(["path1", "path2"]);
    });

    it("should handle undefined with default", () => {
      expect(parseCliStringArray(undefined, ["default"])).toEqual(["default"]);
    });
  });
});

import { describe, expect, it } from "bun:test";
import {
  parseBoolean,
  parseInteger,
  parseOptions,
  parseStringArray,
} from "./config-parser.js";

describe("Config Parser Utilities", () => {
  describe("parseInteger", () => {
    it("should parse valid integer strings", () => {
      expect(parseInteger("42")).toBe(42);
      expect(parseInteger("0")).toBe(0);
      expect(parseInteger("-10")).toBe(-10);
    });

    it("should return undefined for invalid integers", () => {
      expect(parseInteger("abc")).toBeUndefined();
      expect(parseInteger("12.34")).toBeUndefined();
      expect(parseInteger("")).toBeUndefined();
      expect(parseInteger(undefined)).toBeUndefined();
    });

    it("should return default value when provided", () => {
      expect(parseInteger("abc", 100)).toBe(100);
      expect(parseInteger(undefined, 50)).toBe(50);
    });
  });

  describe("parseBoolean", () => {
    it("should parse boolean strings", () => {
      expect(parseBoolean("true")).toBe(true);
      expect(parseBoolean("false")).toBe(false);
      expect(parseBoolean("1")).toBe(true);
      expect(parseBoolean("0")).toBe(false);
    });

    it("should handle boolean values", () => {
      expect(parseBoolean(true)).toBe(true);
      expect(parseBoolean(false)).toBe(false);
    });

    it("should return undefined for invalid values", () => {
      expect(parseBoolean("maybe")).toBeUndefined();
      expect(parseBoolean("")).toBeUndefined();
      expect(parseBoolean(undefined)).toBeUndefined();
    });

    it("should return default value when provided", () => {
      expect(parseBoolean("invalid", true)).toBe(true);
      expect(parseBoolean(undefined, false)).toBe(false);
    });
  });

  describe("parseStringArray", () => {
    it("should parse comma-separated strings", () => {
      expect(parseStringArray("a,b,c")).toEqual(["a", "b", "c"]);
      expect(parseStringArray("one, two, three")).toEqual([
        "one",
        "two",
        "three",
      ]);
    });

    it("should handle arrays", () => {
      expect(parseStringArray(["a", "b"])).toEqual(["a", "b"]);
    });

    it("should handle single values", () => {
      expect(parseStringArray("single")).toEqual(["single"]);
    });

    it("should return empty array for invalid input", () => {
      expect(parseStringArray(undefined)).toEqual([]);
      expect(parseStringArray("")).toEqual([]);
    });
  });

  describe("parseOptions", () => {
    it("should parse option strings with type hints", () => {
      const schema = {
        count: "number",
        enabled: "boolean",
        tags: "array",
        name: "string",
      } as const;

      const result = parseOptions(
        {
          count: "10",
          enabled: "true",
          tags: "a,b,c",
          name: "test",
        },
        schema,
      );

      expect(result).toEqual({
        count: 10,
        enabled: true,
        tags: ["a", "b", "c"],
        name: "test",
      });
    });

    it("should handle missing values with defaults", () => {
      const schema = {
        count: "number",
        enabled: "boolean",
      } as const;

      const defaults = {
        count: 5,
        enabled: false,
      };

      const result = parseOptions({}, schema, defaults);
      expect(result).toEqual(defaults);
    });
  });
});

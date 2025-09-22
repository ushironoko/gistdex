import { describe, expect, it } from "bun:test";
import {
  indexToolSchema,
  listToolSchema,
  queryToolSchema,
} from "./validation.js";

describe("MCP Schema Validation", () => {
  describe("indexToolSchema", () => {
    it("should accept provider and db options", () => {
      const input = {
        type: "text",
        text: {
          content: "test content",
        },
        provider: "sqlite",
        db: "./custom.db",
        preserveBoundaries: true,
      } as const satisfies Record<string, unknown>;

      const result = indexToolSchema.parse(input);
      expect(result.provider).toBe("sqlite");
      expect(result.db).toBe("./custom.db");
      expect(result.preserveBoundaries).toBe(true);
    });

    it("should work without optional database config", () => {
      const input = {
        type: "file",
        file: {
          path: "./test.md",
        },
      } as const satisfies Record<string, unknown>;

      const result = indexToolSchema.parse(input);
      expect(result.provider).toBeUndefined();
      expect(result.db).toBeUndefined();
      expect(result.preserveBoundaries).toBe(true); // default value
    });

    it("should accept preserveBoundaries option", () => {
      const input = {
        type: "files",
        files: {
          pattern: "**/*.ts",
        },
        preserveBoundaries: true,
      } as const satisfies Record<string, unknown>;

      const result = indexToolSchema.parse(input);
      expect(result.preserveBoundaries).toBe(true);
    });
  });

  describe("queryToolSchema", () => {
    it("should accept provider and db options", () => {
      const input = {
        query: "test search",
        provider: "memory",
        db: "./test.db",
        k: 10,
        hybrid: true,
      } as const satisfies Record<string, unknown>;

      const result = queryToolSchema.parse(input);
      expect(result.provider).toBe("memory");
      expect(result.db).toBe("./test.db");
      expect(result.k).toBe(10);
      expect(result.hybrid).toBe(true);
    });

    it("should work without optional database config", () => {
      const input = {
        query: "simple search",
      } as const satisfies Record<string, unknown>;

      const result = queryToolSchema.parse(input);
      expect(result.provider).toBeUndefined();
      expect(result.db).toBeUndefined();
      expect(result.k).toBe(5); // default value
      expect(result.hybrid).toBe(false); // default value
    });

    it("should coerce string boolean values to boolean", () => {
      const input = {
        query: "test coercion",
        hybrid: "true" as unknown as boolean,
        rerank: "false" as unknown as boolean,
        full: "1" as unknown as boolean,
        section: "0" as unknown as boolean,
      };

      const result = queryToolSchema.parse(input);
      expect(result.hybrid).toBe(true);
      expect(result.rerank).toBe(false);
      expect(result.full).toBe(true);
      expect(result.section).toBe(false);
    });

    it("should handle section option correctly", () => {
      const input = {
        query: "markdown search",
        section: true,
      } as const satisfies Record<string, unknown>;

      const result = queryToolSchema.parse(input);
      expect(result.section).toBe(true);
    });

    it("should handle string 'true' for section option", () => {
      const input = {
        query: "markdown search",
        section: "true" as unknown as boolean,
      };

      const result = queryToolSchema.parse(input);
      expect(result.section).toBe(true);
    });
  });

  describe("listToolSchema", () => {
    it("should accept provider and db options", () => {
      const input = {
        limit: 50,
        provider: "sqlite",
        db: "./data.db",
        stats: true,
      } as const satisfies Record<string, unknown>;

      const result = listToolSchema.parse(input);
      expect(result.provider).toBe("sqlite");
      expect(result.db).toBe("./data.db");
      expect(result.limit).toBe(50);
      expect(result.stats).toBe(true);
    });

    it("should work without optional database config", () => {
      const input = {
        type: "gist",
      } as const satisfies Record<string, unknown>;

      const result = listToolSchema.parse(input);
      expect(result.provider).toBeUndefined();
      expect(result.db).toBeUndefined();
      expect(result.limit).toBe(100); // default value
      expect(result.stats).toBe(false); // default value
    });
  });
});

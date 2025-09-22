import { afterEach, describe, expect, it } from "vitest";
import { createParserFactory } from "./parser-factory.js";

describe("parser-factory", () => {
  describe("createParserFactory", () => {
    let factory: ReturnType<typeof createParserFactory>;

    afterEach(() => {
      if (factory) {
        factory.dispose();
      }
    });

    it("should create a parser for JavaScript", async () => {
      factory = createParserFactory();
      const parser = await factory.createParser("javascript");
      expect(parser).not.toBeNull();
    });

    it("should return null for unsupported language", async () => {
      factory = createParserFactory();
      const parser = await factory.createParser("unsupported");
      expect(parser).toBeNull();
    });

    it("should cache parser instances", async () => {
      factory = createParserFactory();
      const parser1 = await factory.createParser("javascript");
      const parser2 = await factory.createParser("javascript");
      expect(parser1).toBe(parser2);
    });

    it("should clear cached parsers on dispose", async () => {
      factory = createParserFactory();
      const parser1 = await factory.createParser("javascript");
      expect(parser1).not.toBeNull();

      factory.dispose();

      // Create new factory
      factory = createParserFactory();
      const parser2 = await factory.createParser("javascript");
      expect(parser2).not.toBe(parser1);
    });
  });
});

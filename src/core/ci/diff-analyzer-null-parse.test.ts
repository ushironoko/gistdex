import { describe, expect, it, vi } from "vitest";

// Mock parser-factory to return a parser whose parse() returns null
vi.mock("../chunk/parser-factory.js", () => ({
  createParserFactory: () => ({
    createParser: async () => ({
      parse: () => null,
      delete: () => {},
    }),
    dispose: () => {},
  }),
}));

// Import after mock setup
const { extractSymbols } = await import("./diff-analyzer.js");

describe("extractSymbols with null parse result", () => {
  it("should fall back to regex extraction when parser.parse() returns null", async () => {
    const content = `
      export function myFunction() {}
      export async function asyncFunc() {}
      class MyClass {}
    `;

    const symbols = await extractSymbols(content, "test.ts");

    // Regex fallback should still extract symbols
    expect(symbols).toContain("myFunction");
    expect(symbols).toContain("asyncFunc");
    expect(symbols).toContain("MyClass");
  });
});

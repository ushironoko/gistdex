import { afterAll, describe, expect, it } from "vitest";
import {
  createCSTChunkingOperations,
  withCSTParsing,
} from "./cst-operations.js";
import { createParserFactory } from "./parser-factory.js";

describe("CST operations - JavaScript", () => {
  const factory = createParserFactory();

  afterAll(() => {
    factory.dispose();
  });

  describe("JavaScript node detection", () => {
    it("should detect function declarations", async () => {
      const code = "function add(a, b) { return a + b; }";

      const result = await withCSTParsing(factory, async (ops) => {
        const boundaries = await ops.parseAndExtractBoundaries(
          code,
          "javascript",
        );
        return boundaries;
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: "function_declaration",
        name: "add",
        text: code,
      });
    });

    it("should detect arrow functions within lexical declarations", async () => {
      const code = "const add = (a, b) => a + b;";

      const result = await withCSTParsing(factory, async (ops) => {
        const boundaries = await ops.parseAndExtractBoundaries(
          code,
          "javascript",
        );
        return boundaries;
      });

      // Lexical declaration containing arrow function should be detected
      const lexicalDecl = result.find((b) => b.type === "lexical_declaration");
      expect(lexicalDecl).toBeDefined();
      expect(lexicalDecl?.text).toBe(code);
    });

    it("should detect class declarations", async () => {
      const code =
        "class Calculator { constructor() {} add(a, b) { return a + b; } }";

      const result = await withCSTParsing(factory, async (ops) => {
        const boundaries = await ops.parseAndExtractBoundaries(
          code,
          "javascript",
        );
        return boundaries;
      });

      // Should detect class as a single boundary (methods are inside)
      const classDecl = result.find((b) => b.type === "class_declaration");
      expect(classDecl).toBeDefined();
      expect(classDecl?.name).toBe("Calculator");
      expect(classDecl?.text).toBe(code);

      // Methods should not be separate boundaries as they're inside the class
      const methodDef = result.find((b) => b.type === "method_definition");
      expect(methodDef).toBeUndefined();
    });

    it("should detect import statements", async () => {
      const code = `import { something } from "module";
import React from "react";`;

      const result = await withCSTParsing(factory, async (ops) => {
        const boundaries = await ops.parseAndExtractBoundaries(
          code,
          "javascript",
        );
        return boundaries;
      });

      const imports = result.filter((b) => b.type === "import_statement");
      expect(imports).toHaveLength(2);
    });

    it("should detect variable declarations", async () => {
      const code = `const x = 10;
let y = 20;
var z = 30;`;

      const result = await withCSTParsing(factory, async (ops) => {
        const boundaries = await ops.parseAndExtractBoundaries(
          code,
          "javascript",
        );
        return boundaries;
      });

      // Lexical declarations (const, let) and variable declarations (var)
      const lexicalDecls = result.filter(
        (b) => b.type === "lexical_declaration",
      );
      const varDecls = result.filter((b) => b.type === "variable_declaration");

      expect(lexicalDecls.length + varDecls.length).toBeGreaterThan(0);
    });

    it("should detect function expressions within lexical declarations", async () => {
      const code = "const fn = function namedFunc() { return 42; };";

      const result = await withCSTParsing(factory, async (ops) => {
        const boundaries = await ops.parseAndExtractBoundaries(
          code,
          "javascript",
        );
        return boundaries;
      });

      // Lexical declaration containing function expression should be detected
      const lexicalDecl = result.find((b) => b.type === "lexical_declaration");
      expect(lexicalDecl).toBeDefined();
      expect(lexicalDecl?.text).toBe(code);
    });

    it("should detect async functions", async () => {
      const code = "async function fetchData() { await fetch('/api'); }";

      const result = await withCSTParsing(factory, async (ops) => {
        const boundaries = await ops.parseAndExtractBoundaries(
          code,
          "javascript",
        );
        return boundaries;
      });

      const asyncFunc = result.find((b) => b.type === "function_declaration");
      expect(asyncFunc).toBeDefined();
      expect(asyncFunc?.name).toBe("fetchData");
    });

    it("should handle complex nested structures", async () => {
      const code = `
class MyComponent {
  constructor() {
    this.state = {};
  }
  
  render() {
    const handleClick = () => {
      console.log("clicked");
    };
    
    return null;
  }
}`;

      const result = await withCSTParsing(factory, async (ops) => {
        const boundaries = await ops.parseAndExtractBoundaries(
          code,
          "javascript",
        );
        return boundaries;
      });

      // Should find only the class as a boundary (everything else is nested inside)
      expect(result.find((b) => b.type === "class_declaration")).toBeDefined();
      expect(result).toHaveLength(1); // Only the class should be a boundary

      // Methods and nested declarations should not be separate boundaries
      expect(result.filter((b) => b.type === "method_definition")).toHaveLength(
        0,
      );
      expect(result.find((b) => b.type === "arrow_function")).toBeUndefined();
    });
  });

  describe("CST chunking operations", () => {
    it("should chunk code with CST boundaries", async () => {
      const operations = createCSTChunkingOperations();
      const code = `function first() {}
function second() {}`;

      const chunks = await operations.chunkWithCST(
        code,
        "javascript",
        { maxChunkSize: 1000, overlap: 100 },
        factory,
      );

      expect(chunks).toHaveLength(2);
      expect(chunks[0].boundary.name).toBe("first");
      expect(chunks[1].boundary.name).toBe("second");
    });

    it("should fall back gracefully for unsupported files", async () => {
      const operations = createCSTChunkingOperations();
      const code = "<template><div></div></template>";

      let fallbackCalled = false;
      const fallback = (code: string, _lang: string, _opts: any) => {
        fallbackCalled = true;
        return [
          {
            content: code,
            startOffset: 0,
            endOffset: code.length,
            boundary: { type: "fallback" },
          },
        ];
      };

      const chunks = await operations.chunkWithFallback(
        code,
        "test.vue",
        { maxChunkSize: 1000, overlap: 100 },
        fallback,
      );

      expect(fallbackCalled).toBe(true);
      expect(chunks[0].boundary.type).toBe("fallback");
    });
  });
});

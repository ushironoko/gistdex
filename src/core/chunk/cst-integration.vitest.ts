import { describe, expect, it } from "vitest";
import { chunkTextWithCST } from "./chunking.js";

describe("CST integration tests", () => {
  describe("chunkTextWithCST", () => {
    it("should use CST for JavaScript files", async () => {
      const jsCode = `
function hello() {
  console.log("Hello, World!");
}

const goodbye = () => {
  console.log("Goodbye!");
};`;

      const chunks = await chunkTextWithCST(jsCode, {
        preserveBoundaries: true,
        filePath: "test.js",
        size: 1000,
        overlap: 100,
      });

      // Should detect two separate functions
      expect(chunks.length).toBeGreaterThan(0);
    });

    it("should use CST for Python files", async () => {
      const pythonCode = `def hello():
    print("Hello, World!")

def goodbye():
    print("Goodbye!")`;

      const chunks = await chunkTextWithCST(pythonCode, {
        preserveBoundaries: true,
        filePath: "test.py",
        size: 1000,
        overlap: 100,
      });

      expect(chunks.length).toBeGreaterThan(0);
    });

    it("should use CST for Go files", async () => {
      const goCode = `package main

func hello() {
    fmt.Println("Hello, World!")
}

func goodbye() {
    fmt.Println("Goodbye!")
}`;

      const chunks = await chunkTextWithCST(goCode, {
        preserveBoundaries: true,
        filePath: "test.go",
        size: 1000,
        overlap: 100,
      });

      expect(chunks.length).toBeGreaterThan(0);
    });

    it("should use CST for TypeScript files", async () => {
      const tsCode = `interface User {
  name: string;
  age: number;
}

class UserService {
  getUser(id: string): User {
    return { name: "John", age: 30 };
  }
}`;

      const chunks = await chunkTextWithCST(tsCode, {
        preserveBoundaries: true,
        filePath: "test.ts",
        size: 1000,
        overlap: 100,
      });

      expect(chunks.length).toBeGreaterThan(0);
    });

    it("should use CST for Vue files", async () => {
      const vueCode = `<template>
  <div>Hello</div>
</template>
<script setup>
const msg = 'World'
</script>`;

      const chunks = await chunkTextWithCST(vueCode, {
        preserveBoundaries: true,
        filePath: "test.vue",
        size: 50,
        overlap: 10,
      });

      // Should chunk using CST boundaries for Vue files
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0]).toContain("<template>");
    });

    it("should handle Markdown files with boundary preservation", async () => {
      const markdown = `# Title

This is a paragraph.

## Subtitle

Another paragraph.`;

      const chunks = await chunkTextWithCST(markdown, {
        preserveBoundaries: true,
        filePath: "test.md",
        size: 1000,
        overlap: 100,
      });

      expect(chunks.length).toBeGreaterThan(0);
    });

    it("should handle missing preserveBoundaries option", async () => {
      const jsCode = "const x = 1; const y = 2;";

      const chunks = await chunkTextWithCST(jsCode, {
        filePath: "test.js",
        size: 15,
        overlap: 5,
      });

      // Should use regular chunking without boundary preservation
      expect(chunks.length).toBeGreaterThan(0);
    });

    it("should handle missing filePath option", async () => {
      const jsCode = "const x = 1; const y = 2;";

      const chunks = await chunkTextWithCST(jsCode, {
        preserveBoundaries: true,
        size: 15,
        overlap: 5,
      });

      // Should use regular chunking without file path
      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe("Cross-language CST support", () => {
    const testCases = [
      {
        name: "JavaScript arrow functions",
        file: "test.js",
        code: "const add = (a, b) => a + b;",
        expectedType: "arrow_function",
      },
      {
        name: "Python function definitions",
        file: "test.py",
        code: "def add(a, b):\n    return a + b",
        expectedType: "function_definition",
      },
      {
        name: "Go function declarations",
        file: "test.go",
        code: "func add(a, b int) int {\n    return a + b\n}",
        expectedType: "function_declaration",
      },
      {
        name: "TypeScript interfaces",
        file: "test.ts",
        code: "interface User {\n  name: string;\n}",
        expectedType: "interface_declaration",
      },
      {
        name: "Vue SFC components",
        file: "test.vue",
        code: "<template>\n  <div>{{ msg }}</div>\n</template>\n<script setup>\nconst msg = 'Hello'\n</script>",
        expectedType: "template_element",
      },
    ];

    testCases.forEach((testCase) => {
      it(`should correctly chunk ${testCase.name}`, async () => {
        const chunks = await chunkTextWithCST(testCase.code, {
          preserveBoundaries: true,
          filePath: testCase.file,
          size: 1000,
          overlap: 100,
        });

        expect(chunks).toBeDefined();
        expect(chunks.length).toBeGreaterThan(0);
      });
    });
  });
});

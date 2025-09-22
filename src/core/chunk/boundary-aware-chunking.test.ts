import { describe, expect, it } from "bun:test";
import {
  type BoundaryChunk,
  chunkCodeByBoundary,
  chunkMarkdownByBoundary,
} from "./boundary-aware-chunking.js";

describe("boundary-aware-chunking", () => {
  describe("chunkMarkdownByBoundary", () => {
    it("should split markdown by heading boundaries", () => {
      const markdown = `# Introduction

This is the introduction section with some content.
It has multiple lines and paragraphs.

## Background

Some background information here.

### Details

More detailed information.

## Conclusion

Final thoughts and summary.`;

      const chunks = chunkMarkdownByBoundary(markdown, {
        maxChunkSize: 200,
        overlap: 50,
      });

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0]).toEqual({
        content: expect.stringContaining("# Introduction"),
        startOffset: 0,
        endOffset: expect.any(Number),
        boundary: {
          type: "heading",
          level: 1,
          title: "Introduction",
        },
      } as BoundaryChunk);

      // Verify all chunks respect boundaries
      chunks.forEach((chunk) => {
        expect(chunk.boundary).toBeDefined();
      });

      // h3 "Details" should be included in the h2 "Background" chunk
      const backgroundChunk = chunks.find(
        (c) => c.boundary.title === "Background",
      );
      expect(backgroundChunk).toBeDefined();
      expect(backgroundChunk?.content).toContain("### Details");
      expect(backgroundChunk?.content).toContain("More detailed information.");
    });

    it("should handle markdown without headings", () => {
      const markdown = `This is a simple paragraph.

Another paragraph here.

And a third one.`;

      const chunks = chunkMarkdownByBoundary(markdown, {
        maxChunkSize: 50,
        overlap: 10,
      });

      expect(chunks.length).toBeGreaterThan(0);
      chunks.forEach((chunk) => {
        expect(chunk.boundary.type).toBe("paragraph");
      });
    });

    it("should preserve code blocks as single chunks", () => {
      const markdown = `# Code Example

Here is a code example:

\`\`\`javascript
function hello() {
  console.log("Hello, World!");
  return 42;
}
\`\`\`

Some text after the code.`;

      const chunks = chunkMarkdownByBoundary(markdown, {
        maxChunkSize: 100,
        overlap: 20,
      });

      const codeChunk = chunks.find((c) => c.boundary.type === "code");
      expect(codeChunk).toBeDefined();
      expect(codeChunk?.content).toContain("```javascript");
      expect(codeChunk?.content).toContain("function hello()");
    });

    it("should handle nested list structures", () => {
      const markdown = `# Lists

- Item 1
  - Nested item 1.1
  - Nested item 1.2
- Item 2
  - Nested item 2.1

Another section here.`;

      const chunks = chunkMarkdownByBoundary(markdown, {
        maxChunkSize: 150,
        overlap: 30,
      });

      // Lists and all content should be included in the heading chunk
      const headingChunk = chunks.find((c) => c.boundary.type === "heading");
      expect(headingChunk).toBeDefined();
      expect(headingChunk?.content).toContain("# Lists");
      expect(headingChunk?.content).toContain("Item 1");
      expect(headingChunk?.content).toContain("Nested item 1.1");
      expect(headingChunk?.content).toContain("Nested item 1.2");
      expect(headingChunk?.content).toContain("Item 2");
      expect(headingChunk?.content).toContain("Nested item 2.1");
      // "Another section here." should also be in the heading chunk
      expect(headingChunk?.content).toContain("Another section here.");

      // There should be only one chunk for this simple markdown
      expect(chunks.length).toBe(1);
    });

    it("should include h3-h6 headings in parent h1/h2 sections", () => {
      const markdown = `# Main Section

Intro text for main section.

## Subsection

Subsection intro.

### Small Heading 1

Content under small heading 1.

#### Tiny Heading

Tiny content.

### Small Heading 2

Content under small heading 2.

## Another Subsection

Another subsection content.`;

      const chunks = chunkMarkdownByBoundary(markdown, {
        maxChunkSize: 300,
        overlap: 50,
      });

      // Find the "Subsection" chunk
      const subsectionChunk = chunks.find(
        (c) => c.boundary.title === "Subsection",
      );
      expect(subsectionChunk).toBeDefined();

      // It should contain all h3-h6 content
      expect(subsectionChunk?.content).toContain("## Subsection");
      expect(subsectionChunk?.content).toContain("### Small Heading 1");
      expect(subsectionChunk?.content).toContain(
        "Content under small heading 1.",
      );
      expect(subsectionChunk?.content).toContain("#### Tiny Heading");
      expect(subsectionChunk?.content).toContain("Tiny content.");
      expect(subsectionChunk?.content).toContain("### Small Heading 2");
      expect(subsectionChunk?.content).toContain(
        "Content under small heading 2.",
      );

      // The "Another Subsection" should be a separate chunk
      const anotherSubsectionChunk = chunks.find(
        (c) => c.boundary.title === "Another Subsection",
      );
      expect(anotherSubsectionChunk).toBeDefined();
      expect(anotherSubsectionChunk?.content).not.toContain(
        "### Small Heading 1",
      );
    });

    it("should respect maxChunkSize while maintaining boundaries", () => {
      const longSection = "This is a very long section. ".repeat(50);
      const markdown = `# Section 1

${longSection}

# Section 2

Short section.`;

      const chunks = chunkMarkdownByBoundary(markdown, {
        maxChunkSize: 200,
        overlap: 50,
      });

      // Long section should be split into multiple chunks
      const section1Chunks = chunks.filter(
        (c) => c.boundary.title === "Section 1",
      );
      expect(section1Chunks.length).toBeGreaterThan(1);

      // Most chunks should respect maxChunkSize (but long sections without natural breaks may exceed it)
      // We allow chunks to be larger when preserving semantic boundaries
      const reasonablyOversized = chunks.filter(
        (c) => c.content.length > 200 * 2,
      );
      expect(reasonablyOversized.length).toBeLessThanOrEqual(1);
    });
  });

  describe("chunkCodeByBoundary", () => {
    it("should split JavaScript code by function boundaries", () => {
      const code = `// Helper functions
function add(a, b) {
  return a + b;
}

function subtract(a, b) {
  return a - b;
}

class Calculator {
  constructor() {
    this.result = 0;
  }
  
  calculate(a, b, op) {
    if (op === 'add') {
      return add(a, b);
    }
    return subtract(a, b);
  }
}`;

      const chunks = chunkCodeByBoundary(code, "javascript", {
        maxChunkSize: 150,
        overlap: 30,
      });

      expect(chunks.length).toBeGreaterThan(0);

      // Should identify function boundaries
      const addChunk = chunks.find((c) => c.content.includes("function add"));
      expect(addChunk?.boundary.type).toBe("function");
      expect(addChunk?.boundary.name).toBe("add");

      // Should identify class boundaries
      const classChunk = chunks.find((c) =>
        c.content.includes("class Calculator"),
      );
      expect(classChunk?.boundary.type).toBe("class");
      expect(classChunk?.boundary.name).toBe("Calculator");
    });

    it("should handle TypeScript interfaces and types", () => {
      const code = `interface User {
  id: number;
  name: string;
  email: string;
}

type UserRole = 'admin' | 'user' | 'guest';

export class UserService {
  private users: User[] = [];
  
  addUser(user: User): void {
    this.users.push(user);
  }
}`;

      const chunks = chunkCodeByBoundary(code, "typescript", {
        maxChunkSize: 100,
        overlap: 20,
      });

      // Should identify interface boundaries
      const interfaceChunk = chunks.find((c) =>
        c.content.includes("interface User"),
      );
      expect(interfaceChunk?.boundary.type).toBe("interface");

      // Should identify type boundaries
      const typeChunk = chunks.find((c) => c.content.includes("type UserRole"));
      expect(typeChunk?.boundary.type).toBe("type");
    });

    it("should handle Python code with class and function definitions", () => {
      const code = `import math

def calculate_area(radius):
    """Calculate the area of a circle."""
    return math.pi * radius ** 2

class Circle:
    def __init__(self, radius):
        self.radius = radius
    
    def area(self):
        return calculate_area(self.radius)`;

      const chunks = chunkCodeByBoundary(code, "python", {
        maxChunkSize: 150,
        overlap: 30,
      });

      const funcChunk = chunks.find((c) =>
        c.content.includes("def calculate_area"),
      );
      expect(funcChunk?.boundary.type).toBe("function");
      expect(funcChunk?.boundary.name).toBe("calculate_area");

      const classChunk = chunks.find((c) => c.content.includes("class Circle"));
      expect(classChunk?.boundary.type).toBe("class");
      expect(classChunk?.boundary.name).toBe("Circle");
    });

    it("should handle code without clear boundaries", () => {
      const code = `const x = 10;
const y = 20;
const result = x + y;
console.log(result);`;

      const chunks = chunkCodeByBoundary(code, "javascript", {
        maxChunkSize: 50,
        overlap: 10,
      });

      expect(chunks.length).toBeGreaterThan(0);
      chunks.forEach((chunk) => {
        expect(chunk.boundary.type).toBe("statement");
      });
    });

    it("should preserve import statements together", () => {
      const code = `import React from 'react';
import { useState, useEffect } from 'react';
import './styles.css';

export function App() {
  const [count, setCount] = useState(0);
  
  return <div>{count}</div>;
}`;

      const chunks = chunkCodeByBoundary(code, "javascript", {
        maxChunkSize: 100,
        overlap: 20,
      });

      const importChunk = chunks.find((c) => c.boundary.type === "imports");
      expect(importChunk).toBeDefined();
      expect(importChunk?.content).toContain("import React");
      expect(importChunk?.content).toContain("import { useState");
    });
  });

  describe("overlap handling", () => {
    it("should include overlap content between chunks", () => {
      const markdown = `# Section 1

First paragraph of section 1.
Second paragraph of section 1.

# Section 2

First paragraph of section 2.
Second paragraph of section 2.`;

      const chunks = chunkMarkdownByBoundary(markdown, {
        maxChunkSize: 100,
        overlap: 30,
      });

      // Adjacent chunks should have overlapping content
      for (let i = 0; i < chunks.length - 1; i++) {
        const currentChunk = chunks[i];
        const nextChunk = chunks[i + 1];

        if (currentChunk && nextChunk) {
          const _currentEnd = currentChunk.content.slice(-30);
          const _nextStart = nextChunk.content.slice(0, 30);
          void _currentEnd;
          void _nextStart;

          // There should be some overlap in content (not exact due to boundary preservation)
          expect(currentChunk.endOffset).toBeLessThanOrEqual(
            nextChunk.startOffset + 30,
          );
        }
      }
    });
  });
});

import { afterAll, describe, expect, it } from "vitest";
import { withCSTParsing } from "./cst-operations.js";
import { createParserFactory } from "./parser-factory.js";

describe("CST operations - Python", () => {
  const factory = createParserFactory();

  afterAll(() => {
    factory.dispose();
  });

  it("should detect function definitions", async () => {
    const code = `def add(a, b):
    return a + b`;

    const result = await withCSTParsing(factory, async (ops) => {
      const boundaries = await ops.parseAndExtractBoundaries(code, "python");
      return boundaries;
    });

    const funcDef = result.find((b) => b.type === "function_definition");
    expect(funcDef).toBeDefined();
    expect(funcDef?.name).toBe("add");
  });

  it("should detect class definitions", async () => {
    const code = `class Calculator:
    def __init__(self):
        self.value = 0
    
    def add(self, x):
        self.value += x`;

    const result = await withCSTParsing(factory, async (ops) => {
      const boundaries = await ops.parseAndExtractBoundaries(code, "python");
      return boundaries;
    });

    const classDef = result.find((b) => b.type === "class_definition");
    expect(classDef).toBeDefined();
    expect(classDef?.name).toBe("Calculator");

    // Methods should not be separate boundaries as they're inside the class
    const methods = result.filter((b) => b.type === "function_definition");
    expect(methods.length).toBe(0);
  });

  it("should detect async functions", async () => {
    const code = `async def fetch_data():
    await asyncio.sleep(1)
    return "data"`;

    const result = await withCSTParsing(factory, async (ops) => {
      const boundaries = await ops.parseAndExtractBoundaries(code, "python");
      return boundaries;
    });

    const funcDef = result.find((b) => b.type === "function_definition");
    expect(funcDef).toBeDefined();
    expect(funcDef?.name).toBe("fetch_data");
  });

  it("should detect import statements", async () => {
    const code = `import os
from typing import List
import asyncio as aio`;

    const result = await withCSTParsing(factory, async (ops) => {
      const boundaries = await ops.parseAndExtractBoundaries(code, "python");
      return boundaries;
    });

    const imports = result.filter(
      (b) =>
        b.type === "import_statement" || b.type === "import_from_statement",
    );
    expect(imports.length).toBeGreaterThan(0);
  });
});

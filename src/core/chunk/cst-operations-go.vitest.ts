import { afterAll, describe, expect, it } from "vitest";
import { withCSTParsing } from "./cst-operations.js";
import { createParserFactory } from "./parser-factory.js";

describe("CST operations - Go", () => {
  const factory = createParserFactory();

  afterAll(() => {
    factory.dispose();
  });

  it("should detect function declarations", async () => {
    const code = `func add(a, b int) int {
    return a + b
}`;

    const result = await withCSTParsing(factory, async (ops) => {
      const boundaries = await ops.parseAndExtractBoundaries(code, "go");
      return boundaries;
    });

    const funcDecl = result.find((b) => b.type === "function_declaration");
    expect(funcDecl).toBeDefined();
    expect(funcDecl?.name).toBe("add");
  });

  it("should detect method declarations", async () => {
    const code = `func (c *Calculator) Add(a, b int) int {
    return a + b
}`;

    const result = await withCSTParsing(factory, async (ops) => {
      const boundaries = await ops.parseAndExtractBoundaries(code, "go");
      return boundaries;
    });

    const methodDecl = result.find((b) => b.type === "method_declaration");
    expect(methodDecl).toBeDefined();
    expect(methodDecl?.name).toBe("Add");
  });

  it("should detect type declarations", async () => {
    const code = `type Calculator struct {
    value int
}`;

    const result = await withCSTParsing(factory, async (ops) => {
      const boundaries = await ops.parseAndExtractBoundaries(code, "go");
      return boundaries;
    });

    const typeDecl = result.find((b) => b.type === "type_declaration");
    expect(typeDecl).toBeDefined();
  });

  it("should detect import declarations", async () => {
    const code = `import (
    "fmt"
    "net/http"
)`;

    const result = await withCSTParsing(factory, async (ops) => {
      const boundaries = await ops.parseAndExtractBoundaries(code, "go");
      return boundaries;
    });

    const imports = result.filter((b) => b.type === "import_declaration");
    expect(imports.length).toBeGreaterThan(0);
  });

  it("should detect variable declarations", async () => {
    const code = `var x int = 10
const PI = 3.14`;

    const result = await withCSTParsing(factory, async (ops) => {
      const boundaries = await ops.parseAndExtractBoundaries(code, "go");
      return boundaries;
    });

    const varDecls = result.filter(
      (b) => b.type === "var_declaration" || b.type === "const_declaration",
    );
    expect(varDecls.length).toBeGreaterThan(0);
  });
});

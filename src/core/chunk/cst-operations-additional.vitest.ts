import { afterAll, describe, expect, it } from "vitest";
import { withCSTParsing } from "./cst-operations.js";
import { createParserFactory } from "./parser-factory.js";

describe("CST operations - Additional Languages", () => {
  const factory = createParserFactory();

  afterAll(() => {
    factory.dispose();
  });

  describe("Rust", () => {
    it("should detect function items", async () => {
      const code = `fn add(a: i32, b: i32) -> i32 {
    a + b
}`;

      const result = await withCSTParsing(factory, async (ops) => {
        const boundaries = await ops.parseAndExtractBoundaries(code, "rust");
        return boundaries;
      });

      const funcItem = result.find((b) => b.type === "function_item");
      expect(funcItem).toBeDefined();
      expect(funcItem?.name).toBe("add");
    });

    it("should detect struct items", async () => {
      const code = `struct Point {
    x: f64,
    y: f64,
}`;

      const result = await withCSTParsing(factory, async (ops) => {
        const boundaries = await ops.parseAndExtractBoundaries(code, "rust");
        return boundaries;
      });

      const structItem = result.find((b) => b.type === "struct_item");
      expect(structItem).toBeDefined();
    });
  });

  describe("Java", () => {
    it("should detect method declarations", async () => {
      const code = `public class Calculator {
    public int add(int a, int b) {
        return a + b;
    }
}`;

      const result = await withCSTParsing(factory, async (ops) => {
        const boundaries = await ops.parseAndExtractBoundaries(code, "java");
        return boundaries;
      });

      const classDec = result.find((b) => b.type === "class_declaration");
      expect(classDec).toBeDefined();

      // Methods should not be separate boundaries as they're inside the class
      const methodDec = result.find((b) => b.type === "method_declaration");
      expect(methodDec).toBeUndefined();
    });
  });

  describe("Ruby", () => {
    it("should detect method definitions", async () => {
      const code = `def add(a, b)
  a + b
end`;

      const result = await withCSTParsing(factory, async (ops) => {
        const boundaries = await ops.parseAndExtractBoundaries(code, "ruby");
        return boundaries;
      });

      const methodDef = result.find((b) => b.type === "method");
      expect(methodDef).toBeDefined();
    });

    it("should detect class definitions", async () => {
      const code = `class Calculator
  def add(a, b)
    a + b
  end
end`;

      const result = await withCSTParsing(factory, async (ops) => {
        const boundaries = await ops.parseAndExtractBoundaries(code, "ruby");
        return boundaries;
      });

      const classDef = result.find((b) => b.type === "class");
      expect(classDef).toBeDefined();
    });
  });

  describe("C", () => {
    it("should detect function definitions", async () => {
      const code = `int add(int a, int b) {
    return a + b;
}`;

      const result = await withCSTParsing(factory, async (ops) => {
        const boundaries = await ops.parseAndExtractBoundaries(code, "c");
        return boundaries;
      });

      const funcDef = result.find((b) => b.type === "function_definition");
      expect(funcDef).toBeDefined();
    });

    it("should detect struct specifiers", async () => {
      const code = `struct Point {
    float x;
    float y;
};`;

      const result = await withCSTParsing(factory, async (ops) => {
        const boundaries = await ops.parseAndExtractBoundaries(code, "c");
        return boundaries;
      });

      const structSpec = result.find((b) => b.type === "struct_specifier");
      expect(structSpec).toBeDefined();
    });
  });

  describe("C++", () => {
    it("should detect class specifiers", async () => {
      const code = `class Calculator {
public:
    int add(int a, int b) {
        return a + b;
    }
};`;

      const result = await withCSTParsing(factory, async (ops) => {
        const boundaries = await ops.parseAndExtractBoundaries(code, "cpp");
        return boundaries;
      });

      const classSpec = result.find((b) => b.type === "class_specifier");
      expect(classSpec).toBeDefined();
    });

    it("should detect namespace definitions", async () => {
      const code = `namespace math {
    int add(int a, int b) {
        return a + b;
    }
}`;

      const result = await withCSTParsing(factory, async (ops) => {
        const boundaries = await ops.parseAndExtractBoundaries(code, "cpp");
        return boundaries;
      });

      const namespaceDef = result.find(
        (b) => b.type === "namespace_definition",
      );
      expect(namespaceDef).toBeDefined();
    });
  });

  describe("HTML", () => {
    it("should detect HTML elements", async () => {
      const code = `<div class="container">
    <h1>Title</h1>
    <p>Content</p>
</div>`;

      const result = await withCSTParsing(factory, async (ops) => {
        const boundaries = await ops.parseAndExtractBoundaries(code, "html");
        return boundaries;
      });

      const elements = result.filter((b) => b.type === "element");
      expect(elements.length).toBeGreaterThan(0);
    });

    it("should detect script elements", async () => {
      const code = `<script>
    console.log("Hello");
</script>`;

      const result = await withCSTParsing(factory, async (ops) => {
        const boundaries = await ops.parseAndExtractBoundaries(code, "html");
        return boundaries;
      });

      const scriptElement = result.find((b) => b.type === "script_element");
      expect(scriptElement).toBeDefined();
    });
  });

  describe("CSS", () => {
    it("should detect rule sets", async () => {
      const code = `.container {
    display: flex;
    padding: 20px;
}`;

      const result = await withCSTParsing(factory, async (ops) => {
        const boundaries = await ops.parseAndExtractBoundaries(code, "css");
        return boundaries;
      });

      const ruleSet = result.find((b) => b.type === "rule_set");
      expect(ruleSet).toBeDefined();
    });

    it("should detect media statements", async () => {
      const code = `@media (max-width: 768px) {
    .container {
        padding: 10px;
    }
}`;

      const result = await withCSTParsing(factory, async (ops) => {
        const boundaries = await ops.parseAndExtractBoundaries(code, "css");
        return boundaries;
      });

      const mediaStmt = result.find((b) => b.type === "media_statement");
      expect(mediaStmt).toBeDefined();
    });
  });

  describe("Bash", () => {
    it("should detect function definitions", async () => {
      const code = `function greet() {
    echo "Hello, $1"
}`;

      const result = await withCSTParsing(factory, async (ops) => {
        const boundaries = await ops.parseAndExtractBoundaries(code, "bash");
        return boundaries;
      });

      const funcDef = result.find((b) => b.type === "function_definition");
      expect(funcDef).toBeDefined();
    });

    it("should detect variable assignments", async () => {
      const code = `NAME="John"
AGE=30
GREETING="Hello, $NAME"`;

      const result = await withCSTParsing(factory, async (ops) => {
        const boundaries = await ops.parseAndExtractBoundaries(code, "bash");
        return boundaries;
      });

      const varAssignments = result.filter(
        (b) => b.type === "variable_assignment",
      );
      expect(varAssignments.length).toBeGreaterThan(0);
    });
  });
});

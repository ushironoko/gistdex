import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "cli/index": "src/cli/index.ts",
    "mcp/server": "src/mcp/server.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  outDir: "dist",
  target: "node24",
  // Keep web-tree-sitter modules external (they use WASM files)
  // Also keep @duckdb/node-api external since it uses native bindings
  external: [
    "web-tree-sitter",
    "tree-sitter-wasms",
    "@duckdb/node-api",
    "@duckdb/node-bindings*",
  ],
});

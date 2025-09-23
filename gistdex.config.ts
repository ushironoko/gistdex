import { defineGistdexConfig } from "@ushironoko/gistdex";

export default defineGistdexConfig({
  vectorDB: {
    provider: "duckdb",
    options: {
      path: "./gistdex-duck.db",
      dimension: 768,
      enableHNSW: true,
      hnswMetric: "cosine",
      hnswPersistence: true,
    },
  },
  ci: {
    doc: {
      threshold: 0.7,
      documentPaths: [
        "docs/guide/*.md",
        "docs/reference/*.md",
        "docs/index.md",
        "README.md",
      ],
    },
  },
});

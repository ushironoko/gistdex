import { defineGistdexConfig } from "@ushironoko/gistdex";

export default defineGistdexConfig({
  vectorDB: {
    provider: "sqlite",
    options: {
      path: "./gistdex.db",
      dimension: 768,
    },
  },
  ci: {
    doc: {
      enabled: true,
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

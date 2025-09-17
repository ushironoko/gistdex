import { platform } from "node:os";
import { defineGistdexConfig } from "@ushironoko/gistdex";

// Linux環境ではbun-sqlite、macOSではsqliteを使用
const provider = platform() === "linux" ? "bun-sqlite" : "sqlite";

export default defineGistdexConfig({
  vectorDB: {
    provider,
    options: {
      path: "./gistdex.db",
      dimension: 768,
    },
  },
});

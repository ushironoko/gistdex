import { defineGistdexConfig } from "@ushironoko/gistdex";
import { platform } from "node:os";

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

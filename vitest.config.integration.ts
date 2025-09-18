import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.git/**",
      "**/.serena/**",
      "**/.claude/**",
    ],
    // Integration tests don't count toward coverage
    coverage: {
      enabled: false,
    },
    testTimeout: 30000, // Longer timeout for integration tests
    hookTimeout: 20000, // Longer hook timeout
  },
});

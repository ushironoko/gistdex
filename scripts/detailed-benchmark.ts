#!/usr/bin/env tsx
import { createDatabaseService } from "../src/core/database/database-service.js";
import { semanticSearch } from "../src/core/search/search.js";

const PROVIDER = process.argv[2] || "sqlite";
const DB_PATH = PROVIDER === "duckdb" ? "./gistdex-duck.db" : "./gistdex.db";

async function main() {
  const service = createDatabaseService();

  // Measure initialization time
  const initStart = performance.now();
  await service.initialize({
    provider: PROVIDER,
    options: {
      path: DB_PATH,
      dimension: 768,
      ...(PROVIDER === "duckdb"
        ? { enableHNSW: true, hnswPersistence: true }
        : {}),
    },
  });
  const initTime = performance.now() - initStart;

  // Count items
  const countStart = performance.now();
  const count = await service.countItems();
  const countTime = performance.now() - countStart;

  // Perform search
  const searchStart = performance.now();
  const results = await semanticSearch(
    "TypeScript interface",
    { k: 10 },
    service,
  );
  const searchTime = performance.now() - searchStart;

  // Close
  const closeStart = performance.now();
  await service.close();
  const closeTime = performance.now() - closeStart;

  // Output JSON for parsing
  console.log(
    JSON.stringify({
      provider: PROVIDER,
      initTime,
      countTime,
      searchTime,
      closeTime,
      totalTime: initTime + countTime + searchTime + closeTime,
      itemCount: count,
      resultCount: results.length,
    }),
  );
}

main().catch(console.error);

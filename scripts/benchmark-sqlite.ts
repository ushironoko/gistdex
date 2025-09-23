#!/usr/bin/env tsx
import { createDatabaseService } from "../src/core/database/database-service.js";
import { semanticSearch } from "../src/core/search/search.js";

async function main() {
  const service = createDatabaseService();
  await service.initialize({
    provider: "sqlite",
    options: {
      path: "./gistdex.db",
      dimension: 768,
    },
  });

  // Perform search
  const results = await semanticSearch(
    "TypeScript interface",
    { k: 10 },
    service,
  );
  console.log(`Found ${results.length} results`);

  await service.close();
}

main().catch(console.error);

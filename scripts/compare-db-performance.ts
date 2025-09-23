#!/usr/bin/env tsx
import { createDatabaseService } from "../src/core/database/database-service.js";
import { semanticSearch } from "../src/core/search/search.js";

async function measurePerformance(dbPath: string, provider: string) {
  console.log(`\n📊 Testing ${provider} (${dbPath})`);
  console.log(`${"=".repeat(50)}`);

  const service = createDatabaseService();
  await service.initialize({
    provider,
    options: {
      path: dbPath,
      dimension: 768,
      ...(provider === "duckdb"
        ? { enableHNSW: true, hnswPersistence: true }
        : {}),
    },
  });

  // Count total items
  const totalItems = await service.countItems();
  console.log(`Total indexed items: ${totalItems}`);

  // Test queries
  const queries = [
    "vector database adapter",
    "TypeScript interface",
    "async function",
    "error handling",
    "test implementation",
  ];

  const searchResults: { query: string; time: number; results: number }[] = [];

  // Warm up
  await semanticSearch("warm up query", { k: 5 }, service);

  // Perform searches
  for (const query of queries) {
    const startTime = performance.now();
    const results = await semanticSearch(query, { k: 10 }, service);
    const endTime = performance.now();
    const searchTime = endTime - startTime;

    searchResults.push({
      query,
      time: searchTime,
      results: results.length,
    });

    console.log(
      `  ✓ "${query}": ${searchTime.toFixed(2)}ms (${results.length} results)`,
    );
  }

  // Calculate statistics
  const times = searchResults.map((r) => r.time);
  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);

  console.log("\n📈 Statistics:");
  console.log(`  Average: ${avgTime.toFixed(2)}ms`);
  console.log(`  Min: ${minTime.toFixed(2)}ms`);
  console.log(`  Max: ${maxTime.toFixed(2)}ms`);

  // Test batch search performance
  console.log("\n🔄 Batch search test (10 parallel searches):");
  const batchStartTime = performance.now();
  const batchPromises = [];
  for (let i = 0; i < 10; i++) {
    batchPromises.push(
      semanticSearch("concurrent search test", { k: 5 }, service),
    );
  }
  await Promise.all(batchPromises);
  const batchEndTime = performance.now();
  const batchTime = batchEndTime - batchStartTime;
  console.log(`  10 parallel searches: ${batchTime.toFixed(2)}ms total`);
  console.log(`  Average per search: ${(batchTime / 10).toFixed(2)}ms`);

  await service.close();
  return {
    provider,
    avgTime,
    minTime,
    maxTime,
    batchTime,
    totalItems,
  };
}

async function main() {
  console.log("🚀 Vector Database Performance Comparison");
  console.log("Testing SQLite vs DuckDB on the same indexed data\n");

  try {
    // Test both databases
    const sqliteResults = await measurePerformance("./gistdex.db", "sqlite");
    const duckdbResults = await measurePerformance(
      "./gistdex-duck.db",
      "duckdb",
    );

    // Compare results
    console.log(`\n${"=".repeat(50)}`);
    console.log("📊 COMPARISON SUMMARY");
    console.log(`${"=".repeat(50)}`);

    console.log("\n🔍 Single Query Performance:");
    console.log(`  SQLite avg: ${sqliteResults.avgTime.toFixed(2)}ms`);
    console.log(`  DuckDB avg: ${duckdbResults.avgTime.toFixed(2)}ms`);
    const speedup = sqliteResults.avgTime / duckdbResults.avgTime;
    if (speedup > 1) {
      console.log(`  ⚡ DuckDB is ${speedup.toFixed(1)}x faster`);
    } else {
      console.log(`  ⚡ SQLite is ${(1 / speedup).toFixed(1)}x faster`);
    }

    console.log("\n📦 Batch Query Performance (10 parallel):");
    console.log(`  SQLite: ${sqliteResults.batchTime.toFixed(2)}ms`);
    console.log(`  DuckDB: ${duckdbResults.batchTime.toFixed(2)}ms`);
    const batchSpeedup = sqliteResults.batchTime / duckdbResults.batchTime;
    if (batchSpeedup > 1) {
      console.log(
        `  ⚡ DuckDB is ${batchSpeedup.toFixed(1)}x faster for batch`,
      );
    } else {
      console.log(
        `  ⚡ SQLite is ${(1 / batchSpeedup).toFixed(1)}x faster for batch`,
      );
    }

    console.log("\n📈 Performance Range:");
    console.log(
      `  SQLite: ${sqliteResults.minTime.toFixed(
        2,
      )}ms - ${sqliteResults.maxTime.toFixed(2)}ms`,
    );
    console.log(
      `  DuckDB: ${duckdbResults.minTime.toFixed(
        2,
      )}ms - ${duckdbResults.maxTime.toFixed(2)}ms`,
    );
  } catch (error) {
    console.error("Error during performance test:", error);
  }
}

main().catch(console.error);

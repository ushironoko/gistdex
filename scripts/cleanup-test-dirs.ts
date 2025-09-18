#!/usr/bin/env tsx
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const TEST_BASE_DIR = "./data/tests/fixtures";

function cleanupTestDirs(): void {
  if (!existsSync(TEST_BASE_DIR)) {
    console.log("Test directory does not exist");
    return;
  }

  try {
    const entries = readdirSync(TEST_BASE_DIR);
    let count = 0;

    for (const entry of entries) {
      // Skip .gitkeep file
      if (entry !== ".gitkeep") {
        const fullPath = join(TEST_BASE_DIR, entry);
        rmSync(fullPath, { recursive: true, force: true });
        count++;
      }
    }

    if (count > 0) {
      console.log(`✅ Cleaned up ${count} test directories`);
    } else {
      console.log("No test directories to clean up");
    }
  } catch (error) {
    console.error("❌ Failed to cleanup test directories:", error);
    process.exit(1);
  }
}

// Execute cleanup
cleanupTestDirs();

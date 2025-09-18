import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";

const TEST_BASE_DIR = "./data/tests/fixtures";

/**
 * Ensure test base directory exists
 */
export async function ensureTestBaseDir(): Promise<void> {
  if (!existsSync(TEST_BASE_DIR)) {
    await mkdir(TEST_BASE_DIR, { recursive: true });
  }
}

/**
 * Create a temporary directory for tests within allowed security boundaries
 * @param prefix - Prefix for the temporary directory
 * @returns Path to the created temporary directory
 */
export async function createTestTempDir(prefix = "test-"): Promise<string> {
  await ensureTestBaseDir();
  const tempDir = await mkdtemp(join(TEST_BASE_DIR, prefix));
  return tempDir;
}

/**
 * Clean up test directory
 * @param dirPath - Path to the directory to clean up
 */
export async function cleanupTestDir(dirPath: string): Promise<void> {
  // Only clean up directories within our test base
  if (dirPath.startsWith(TEST_BASE_DIR)) {
    await rm(dirPath, { recursive: true, force: true }).catch(() => {
      // Ignore errors during cleanup
    });
  }
}

/**
 * Clean up all test directories (keeps .gitkeep)
 */
export async function cleanupAllTestDirs(): Promise<void> {
  if (!existsSync(TEST_BASE_DIR)) {
    return;
  }

  try {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(TEST_BASE_DIR);

    // Remove all directories/files except .gitkeep
    for (const entry of entries) {
      if (entry !== ".gitkeep") {
        const fullPath = join(TEST_BASE_DIR, entry);
        await rm(fullPath, { recursive: true, force: true }).catch(() => {
          // Ignore individual cleanup errors
        });
      }
    }
  } catch (error) {
    // Ignore errors during cleanup
    console.warn("Failed to cleanup test directories:", error);
  }
}

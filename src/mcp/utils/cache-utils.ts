import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Get the cache directory path
 *
 * This function ensures the .gistdex/cache directory exists and returns
 * the path for cache operations across different modules.
 */
export function getCacheDir(): string {
  // Check for .gistdex/cache in current directory first
  const localCache = join(process.cwd(), ".gistdex", "cache");
  const gistdexDir = dirname(localCache);

  // Create .gistdex directory if it doesn't exist
  if (!existsSync(gistdexDir)) {
    mkdirSync(gistdexDir, { recursive: true });
  }

  return localCache;
}

/**
 * Ensure a specific cache subdirectory exists
 *
 * @param subdir - Subdirectory name within the cache directory
 * @returns Full path to the subdirectory
 */
export function ensureCacheSubdir(subdir: string): string {
  const cacheDir = getCacheDir();
  const fullPath = join(cacheDir, subdir);

  if (!existsSync(fullPath)) {
    mkdirSync(fullPath, { recursive: true });
  }

  return fullPath;
}

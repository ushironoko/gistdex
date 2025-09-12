import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { VectorSearchResult } from "../../core/vector-db/adapters/types.js";

export interface CachedQuery {
  query: string;
  strategy: "hybrid" | "semantic";
  useSection?: boolean;
  useFull?: boolean;
  timestamp: string;
  resultsCount: number;
  resultSummary: string;
}

export interface QueryCache {
  version: string;
  queries: CachedQuery[];
}

const CACHE_VERSION = "1.0.0";

/**
 * Get the cache directory path
 */
export function getCacheDir(): string {
  // Check for .gistdex/cache in current directory first
  const localCache = join(process.cwd(), ".gistdex", "cache");
  if (existsSync(dirname(localCache))) {
    return localCache;
  }

  // Fall back to home directory
  return join(homedir(), ".gistdex", "cache");
}

/**
 * Ensure cache directories exist
 */
export async function ensureCacheDirectories(): Promise<void> {
  const cacheDir = getCacheDir();
  const resultsDir = join(cacheDir, "results");

  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }

  if (!existsSync(resultsDir)) {
    mkdirSync(resultsDir, { recursive: true });
  }
}

/**
 * Load cached queries from disk
 */
export function loadCachedQueries(): QueryCache {
  const cacheFile = join(getCacheDir(), "queries.json");

  if (!existsSync(cacheFile)) {
    return {
      version: CACHE_VERSION,
      queries: [],
    };
  }

  try {
    const content = readFileSync(cacheFile, "utf-8");
    const cache = JSON.parse(content) as QueryCache;

    // Check version compatibility
    if (cache.version !== CACHE_VERSION) {
      console.warn(
        `Cache version mismatch. Expected ${CACHE_VERSION}, got ${cache.version}`,
      );
      return {
        version: CACHE_VERSION,
        queries: [],
      };
    }

    return cache;
  } catch (error) {
    console.error("Failed to load query cache:", error);
    return {
      version: CACHE_VERSION,
      queries: [],
    };
  }
}

/**
 * Save a successful query to cache
 */
export async function saveSuccessfulQuery(
  query: string,
  results: VectorSearchResult[],
  options: {
    strategy: "hybrid" | "semantic";
    useSection?: boolean;
    useFull?: boolean;
  },
): Promise<void> {
  const cache = loadCachedQueries();

  // Create a summary of the results
  const resultSummary = results
    .slice(0, 3)
    .map((r) => {
      // Extract filename from title or filePath, or use sourceType
      let source = "unknown";
      if (r.metadata?.title) {
        // If title is a path, extract just the filename
        source = r.metadata.title.includes("/")
          ? r.metadata.title.split("/").pop() || r.metadata.title
          : r.metadata.title;
      } else if (r.metadata?.filePath) {
        source = r.metadata.filePath.split("/").pop() || r.metadata.filePath;
      } else if (r.metadata?.sourceType) {
        source = r.metadata.sourceType;
      }
      const score = r.score.toFixed(3);
      return `${source} (${score})`;
    })
    .join(", ");

  const cachedQuery: CachedQuery = {
    query,
    strategy: options.strategy,
    useSection: options.useSection,
    useFull: options.useFull,
    timestamp: new Date().toISOString(),
    resultsCount: results.length,
    resultSummary,
  };

  // Check if query already exists and update it
  const existingIndex = cache.queries.findIndex(
    (q) => q.query === query && q.strategy === options.strategy,
  );

  if (existingIndex >= 0) {
    cache.queries[existingIndex] = cachedQuery;
  } else {
    cache.queries.push(cachedQuery);
  }

  // Keep only the last 100 queries
  if (cache.queries.length > 100) {
    cache.queries = cache.queries.slice(-100);
  }

  // Save to disk
  const cacheFile = join(getCacheDir(), "queries.json");
  writeFileSync(cacheFile, JSON.stringify(cache, null, 2));

  // Also save as markdown for easy reading
  await saveQueriesAsMarkdown(cache);
}

/**
 * Save queries as markdown for easy reading
 */
async function saveQueriesAsMarkdown(cache: QueryCache): Promise<void> {
  const lines: string[] = [
    "# Gistdex Query Cache",
    "",
    `Version: ${cache.version}`,
    `Last updated: ${new Date().toISOString()}`,
    "",
    "## Successful Queries",
    "",
  ];

  // Group queries by strategy
  const hybridQueries = cache.queries.filter((q) => q.strategy === "hybrid");
  const semanticQueries = cache.queries.filter(
    (q) => q.strategy === "semantic",
  );

  if (hybridQueries.length > 0) {
    lines.push("### Hybrid Search Queries");
    lines.push("");
    hybridQueries.forEach((q) => {
      lines.push(`- **Query**: "${q.query}"`);
      if (q.useSection) lines.push(`  - Uses section retrieval`);
      if (q.useFull) lines.push(`  - Uses full content retrieval`);
      lines.push(`  - Results: ${q.resultsCount}`);
      lines.push(`  - Top results: ${q.resultSummary}`);
      lines.push(`  - Timestamp: ${q.timestamp}`);
      lines.push("");
    });
  }

  if (semanticQueries.length > 0) {
    lines.push("### Semantic Search Queries");
    lines.push("");
    semanticQueries.forEach((q) => {
      lines.push(`- **Query**: "${q.query}"`);
      if (q.useSection) lines.push(`  - Uses section retrieval`);
      if (q.useFull) lines.push(`  - Uses full content retrieval`);
      lines.push(`  - Results: ${q.resultsCount}`);
      lines.push(`  - Top results: ${q.resultSummary}`);
      lines.push(`  - Timestamp: ${q.timestamp}`);
      lines.push("");
    });
  }

  const mdFile = join(getCacheDir(), "queries.md");
  writeFileSync(mdFile, lines.join("\n"));
}

/**
 * Find similar cached queries
 */
export function findSimilarQuery(
  query: string,
  strategy: "hybrid" | "semantic",
): CachedQuery | null {
  const cache = loadCachedQueries();
  const queryLower = query.toLowerCase();

  // Look for exact match first
  const exactMatch = cache.queries.find(
    (q) => q.query.toLowerCase() === queryLower && q.strategy === strategy,
  );

  if (exactMatch) {
    return exactMatch;
  }

  // Look for similar queries (containing same keywords)
  const keywords = queryLower.split(/\s+/).filter((w) => w.length > 3);

  const similar = cache.queries.filter((q) => {
    if (q.strategy !== strategy) return false;

    const qLower = q.query.toLowerCase();
    const matchCount = keywords.filter((k) => qLower.includes(k)).length;

    // Consider similar if 70% of keywords match
    return matchCount >= keywords.length * 0.7;
  });

  // Return the most recent similar query
  if (similar.length > 0) {
    const sorted = similar.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    return sorted[0] ?? null;
  }

  return null;
}

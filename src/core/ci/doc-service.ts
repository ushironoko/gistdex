import { glob } from "node:fs/promises";
import type { DatabaseService } from "../database/database-service.js";
import { createGlobMatcher } from "../indexer/glob-matcher.js";
import { indexFiles } from "../indexer/indexer.js";
import { hybridSearch } from "../search/search.js";
import { analyzeDiff, type DiffChange } from "./diff-analyzer.js";

export interface DocAnalysisResult {
  file: string;
  similarity: number;
  matchedTerms?: string[];
  changeType: "added" | "modified" | "deleted";
  lineNumbers?: number[];
  startLine?: number;
  endLine?: number;
  githubUrl?: string;
}

export interface DocAnalysisOptions {
  threshold?: number;
  documentPaths?: string[];
  verbose?: boolean;
}

/**
 * Ensure documents are indexed before analysis
 */
export const ensureDocumentsIndexed = async (
  patterns: string[],
  db: DatabaseService,
): Promise<void> => {
  // Get all files matching the patterns
  const files: string[] = [];
  for (const pattern of patterns) {
    try {
      for await (const match of glob(pattern, {
        exclude: (path: string) => path.includes("node_modules"),
      })) {
        files.push(match);
      }
    } catch (error) {
      console.warn(`Failed to process pattern ${pattern}:`, error);
    }
  }

  if (files.length === 0) {
    console.error("No documentation files found matching patterns:", patterns);
    return;
  }

  // Check what's already indexed - group by sourceId and take first chunk
  const indexed = await db.listItems();
  const sourceGroups = new Map<string, any>();

  // Group items by sourceId to find unique documents
  for (const item of indexed) {
    const sourceId = item.metadata?.sourceId;
    if (sourceId && item.metadata?.chunkIndex === 0) {
      sourceGroups.set(sourceId, item);
    }
  }

  // Get unique file paths from first chunks only
  const indexedPaths = new Set(
    Array.from(sourceGroups.values())
      .map((item) => item.metadata?.filePath as string | undefined)
      .filter(Boolean),
  );

  // Find files that need indexing
  const toIndex = files.filter((f) => !indexedPaths.has(f));

  if (toIndex.length > 0) {
    console.error(`📝 Indexing ${toIndex.length} documentation files...`);

    // Index files with appropriate settings
    const results = await indexFiles(
      toIndex,
      {}, // metadata
      {
        chunkSize: 1000,
        chunkOverlap: 200,
        preserveBoundaries: true,
      }, // options
      db,
    );

    if (results.errors.length > 0) {
      console.warn(
        `⚠️  Encountered ${results.errors.length} errors during indexing`,
      );
    }

    console.error(
      `✅ Indexed ${results.itemsIndexed} items from ${toIndex.length} files`,
    );
  } else {
    console.error(`✅ All ${files.length} documentation files already indexed`);
  }
};

/**
 * Generate GitHub URL for a file location
 */
const generateGitHubUrl = (
  filePath: string,
  startLine?: number,
  endLine?: number,
): string | undefined => {
  // Get GitHub repository info from environment variables (set in CI)
  const repository = process.env.GITHUB_REPOSITORY; // "owner/repo" format
  // Use SHA if available (more specific), otherwise use branch names
  const branch =
    process.env.GITHUB_SHA ||
    process.env.GITHUB_HEAD_REF ||
    process.env.GITHUB_REF_NAME ||
    "main";

  if (!repository) {
    // Not in GitHub Actions environment
    return undefined;
  }

  // Normalize file path - remove GitHub Actions workspace prefix
  let normalizedPath = filePath;

  // Try to use GITHUB_WORKSPACE first
  if (process.env.GITHUB_WORKSPACE) {
    const workspace = process.env.GITHUB_WORKSPACE;
    if (filePath.startsWith(workspace)) {
      normalizedPath = filePath.substring(workspace.length + 1); // +1 for the trailing slash
    }
  } else if (repository) {
    // Fallback: Remove common CI prefixes based on repository name
    const repoName = repository.split("/")[1];
    if (repoName) {
      const prefix = `/home/runner/work/${repoName}/${repoName}/`;
      if (filePath.startsWith(prefix)) {
        normalizedPath = filePath.substring(prefix.length);
      } else {
        // Generic fallback
        normalizedPath = filePath
          .replace(/^\/home\/runner\/work\/[^/]+\/[^/]+\//, "")
          .replace(/^\//, "");
      }
    }
  } else {
    // Last fallback: just remove leading slash if absolute path
    normalizedPath = filePath.replace(/^\//, "");
  }

  // For markdown files, add ?plain=1 to show raw text view instead of rendered markdown
  const isMarkdown = normalizedPath.endsWith(".md");
  let url = `https://github.com/${repository}/blob/${branch}/${normalizedPath}`;

  if (isMarkdown) {
    url += "?plain=1";
  }

  // Add line anchors if available
  if (startLine && endLine) {
    url += isMarkdown
      ? `#L${startLine}-L${endLine}`
      : `#L${startLine}-L${endLine}`;
  } else if (startLine) {
    url += `#L${startLine}`;
  }

  return url;
};

/**
 * Analyze documentation from code changes
 */
export const analyzeDocuments = async (
  diffRange: string,
  options: DocAnalysisOptions,
  db: DatabaseService,
): Promise<DocAnalysisResult[]> => {
  const threshold = options.threshold ?? 0.7;
  const documentPaths = options.documentPaths ?? ["docs/**/*.md", "README.md"];

  // Ensure documents are indexed
  await ensureDocumentsIndexed(documentPaths, db);

  // Analyze the diff
  const { changes, searchQueries } = await analyzeDiff(diffRange);

  if (changes.length === 0) {
    console.error("No changes detected in the specified range");
    return [];
  }

  if (options.verbose) {
    console.error(`📊 Analyzing ${changes.length} changed files`);
    console.error(`🔍 Generated ${searchQueries.length} search queries`);

    // Debug: Show what files were changed
    console.error("Changed files:");
    for (const change of changes) {
      console.error(
        `  - ${change.file} (${change.type}): ${change.symbols.length} symbols`,
      );
    }

    // Debug: Show generated queries
    console.error("Search queries:");
    for (const query of searchQueries) {
      console.error(`  - "${query}"`);
    }
  }

  // Create glob matcher for document paths
  const isDocumentFile = createGlobMatcher(documentPaths);

  // Collect all analyzed documents
  const analysisMap = new Map<string, DocAnalysisResult>();

  // Debug: Track search results
  let totalSearchResults = 0;
  let filteredByPath = 0;
  let filteredByThreshold = 0;

  // Search for each query
  for (const query of searchQueries) {
    try {
      // Use hybrid search for better coverage
      const results = await hybridSearch(
        query,
        {
          k: 10,
          keywordWeight: 0.3,
        },
        db,
      );

      if (options.verbose && results.length > 0) {
        console.error(`  Query "${query}" returned ${results.length} results`);
      }

      totalSearchResults += results.length;

      // Process results
      for (const result of results) {
        // Support both filePath (local files) and path (GitHub files)
        const docPath = result.metadata?.filePath || result.metadata?.path;

        if (!docPath) continue;

        // Convert absolute path to relative for glob matching
        // The glob patterns are relative (e.g., "docs/**/*.md")
        // but indexed files may have absolute paths
        let pathForMatching = docPath;
        if (docPath.startsWith("/")) {
          // Try to make it relative to current working directory
          const cwd = process.cwd();
          if (docPath.startsWith(cwd)) {
            pathForMatching = docPath.substring(cwd.length + 1); // +1 for the trailing slash
          }
        }

        // Check if this is a documentation file using glob matcher
        const isDoc = isDocumentFile(pathForMatching);

        if (!isDoc) {
          filteredByPath++;
          if (options.verbose) {
            console.error(
              `    Filtered out non-doc: ${docPath} (tested as: ${pathForMatching})`,
            );
          }
          continue;
        }

        // Calculate similarity score
        const similarity = result.score ?? 0;

        if (similarity < threshold) {
          filteredByThreshold++;
          if (options.verbose) {
            console.error(
              `    Filtered out by threshold: ${docPath} (${(similarity * 100).toFixed(1)}%)`,
            );
          }
          continue;
        }

        const existingAnalysis = analysisMap.get(docPath);

        if (!existingAnalysis || existingAnalysis.similarity < similarity) {
          // Determine change type based on the most relevant change
          const relevantChange = findMostRelevantChange(changes, query);

          // Extract line numbers from boundary metadata if available
          // Try to get line numbers from boundary metadata
          const boundary = result.metadata?.boundary as
            | {
                startLine?: number;
                endLine?: number;
              }
            | undefined;

          // Also check if line numbers are directly in metadata
          const startLine =
            boundary?.startLine ||
            (result.metadata?.startLine as number | undefined);
          const endLine =
            boundary?.endLine ||
            (result.metadata?.endLine as number | undefined);

          if (options.verbose) {
            console.error(
              `    ✅ Matched: ${docPath} (${(similarity * 100).toFixed(1)}%)`,
            );
          }

          analysisMap.set(docPath, {
            file: docPath,
            similarity,
            matchedTerms: [query],
            changeType: relevantChange?.type ?? "modified",
            startLine,
            endLine,
            githubUrl: generateGitHubUrl(docPath, startLine, endLine),
          });
        } else if (existingAnalysis) {
          // Add matched term if not already present
          if (!existingAnalysis.matchedTerms?.includes(query)) {
            existingAnalysis.matchedTerms?.push(query);
          }
        }
      }
    } catch (error) {
      if (options.verbose) {
        console.warn(`Failed to search for query "${query}":`, error);
      }
    }
  }

  if (options.verbose) {
    console.error(`\n📈 Search Statistics:`);
    console.error(`  Total search results: ${totalSearchResults}`);
    console.error(`  Filtered by path pattern: ${filteredByPath}`);
    console.error(`  Filtered by threshold: ${filteredByThreshold}`);
  }

  // Convert map to array and sort by similarity
  const results = Array.from(analysisMap.values()).sort(
    (a, b) => b.similarity - a.similarity,
  );

  if (options.verbose) {
    console.error(`📚 Found ${results.length} related documentation files`);
  }

  return results;
};

/**
 * Find the most relevant change for a given query
 */
const findMostRelevantChange = (
  changes: DiffChange[],
  query: string,
): DiffChange | undefined => {
  const queryLower = query.toLowerCase();

  // First, check for exact symbol matches
  for (const change of changes) {
    if (change.symbols.some((s) => s.toLowerCase() === queryLower)) {
      return change;
    }
  }

  // Then, check for file name matches
  for (const change of changes) {
    const fileName = change.file.split("/").pop()?.toLowerCase();
    if (fileName?.includes(queryLower)) {
      return change;
    }
  }

  // Finally, check content
  for (const change of changes) {
    if (change.content.toLowerCase().includes(queryLower)) {
      return change;
    }
  }

  return changes[0]; // Default to first change if no match
};

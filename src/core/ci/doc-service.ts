import { glob } from "node:fs/promises";
import type { DatabaseService } from "../database/database-service.js";
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

  // Check what's already indexed
  const indexed = await db.listItems();
  const indexedPaths = new Set(
    indexed
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
      {
        chunkSize: 1000,
        chunkOverlap: 200,
        preserveBoundaries: true,
      },
      {},
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
  const branch =
    process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || "main";

  if (!repository) {
    // Not in GitHub Actions environment
    return undefined;
  }

  let url = `https://github.com/${repository}/blob/${branch}/${filePath}`;

  // Add line anchors if available
  if (startLine && endLine) {
    url += `#L${startLine}-L${endLine}`;
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
  }

  // Collect all analyzed documents
  const analysisMap = new Map<string, DocAnalysisResult>();

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

      // Process results
      for (const result of results) {
        // Support both filePath (local files) and path (GitHub files)
        const docPath = (result.metadata?.filePath || result.metadata?.path) as
          | string
          | undefined;
        if (!docPath) continue;

        // Check if this is a documentation file
        const isDoc = documentPaths.some((pattern) => {
          const regex = new RegExp(
            pattern
              .replace(/\*\*/g, ".*")
              .replace(/\*/g, "[^/]*")
              .replace(/\?/g, "[^/]"),
          );
          return regex.test(docPath);
        });

        if (!isDoc) continue;

        // Calculate similarity score
        const similarity = result.score ?? 0;

        if (similarity >= threshold) {
          const existingAnalysis = analysisMap.get(docPath);

          if (!existingAnalysis || existingAnalysis.similarity < similarity) {
            // Determine change type based on the most relevant change
            const relevantChange = findMostRelevantChange(changes, query);

            // Extract line numbers from boundary metadata if available
            const boundary = result.metadata?.boundary as
              | {
                  startLine?: number;
                  endLine?: number;
                }
              | undefined;
            const startLine = boundary?.startLine;
            const endLine = boundary?.endLine;

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
      }
    } catch (error) {
      if (options.verbose) {
        console.warn(`Failed to search for query "${query}":`, error);
      }
    }
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

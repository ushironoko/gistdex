/**
 * Public API for CI documentation impact analysis
 * This module provides a clean interface for external packages to use CI functionality
 */

import { createConfigOperations } from "../config/config-operations.js";
import { createDatabaseService } from "../database/database-service.js";
import { analyzeDocuments } from "./doc-service.js";
import { formatGitHubComment, formatJSON } from "./formatters.js";
import { postToGitHubPR } from "./github-integration.js";

export interface DocumentImpactOptions {
  /** Git diff range (e.g., "main..HEAD", "HEAD~1") */
  diff?: string;
  /** Similarity threshold (0-1) */
  threshold?: number;
  /** Document paths/patterns to analyze */
  paths?: string[];
  /** Output format - json for data exchange, github-comment for direct posting */
  format?: "json" | "github-comment";
  /** Database configuration */
  database?: {
    provider?: string;
    path?: string;
  };
  /** Verbose output */
  verbose?: boolean;
}

// Use the actual type from doc-service
import type { DocAnalysisResult } from "./doc-service.js";

// Alias for public API
export type DocumentImpactResult = DocAnalysisResult;

/**
 * Analyze documentation impact from code changes
 *
 * @example
 * ```typescript
 * import { analyzeDocumentImpact } from "@ushironoko/gistdex";
 *
 * const results = await analyzeDocumentImpact({
 *   diff: "main..HEAD",
 *   threshold: 0.7,
 *   paths: ["docs/**\/*.md"],
 *   format: "json"
 * });
 * ```
 */
export async function analyzeDocumentImpact(
  options: DocumentImpactOptions = {},
): Promise<DocumentImpactResult[] | string> {
  // Load configuration
  const configOps = createConfigOperations();
  const config = await configOps.load();
  const ciConfig = config.ci?.doc;

  // Merge options with defaults
  const threshold = options.threshold ?? ciConfig?.threshold ?? 0.7;
  const format = options.format ?? "github-comment";
  const diffRange = options.diff ?? "HEAD~1";
  const documentPaths = options.paths ?? ciConfig?.documentPaths;

  // Create database service
  const dbService = createDatabaseService();
  const dbConfig = options.database
    ? {
        ...config.vectorDB,
        ...options.database,
      }
    : config.vectorDB;

  // Perform analysis
  await dbService.initialize(dbConfig);
  try {
    const results = await analyzeDocuments(
      diffRange,
      {
        documentPaths,
        threshold,
        verbose: options.verbose ?? false,
      },
      dbService,
    );

    // Format results based on requested format
    if (format === "github-comment") {
      return formatGitHubComment(results, threshold);
    }
    // json is the default
    return formatJSON(results, threshold, diffRange);
  } finally {
    await dbService.close();
  }
}

/**
 * Post documentation impact results to GitHub PR
 *
 * @example
 * ```typescript
 * import { postDocumentImpactToGitHub } from "@ushironoko/gistdex";
 *
 * await postDocumentImpactToGitHub(results, {
 *   token: process.env.GITHUB_TOKEN,
 *   repository: "owner/repo",
 *   issueNumber: 123
 * });
 * ```
 */
export async function postDocumentImpactToGitHub(
  results: DocumentImpactResult[],
  options: {
    token: string;
    repository: string;
    issueNumber: number;
    threshold?: number;
  },
): Promise<void> {
  const threshold = options.threshold ?? 0.7;
  const comment = formatGitHubComment(results, threshold);

  // For now, we'll use the environment-based posting
  // In the future, this should be refactored to accept explicit parameters
  process.env.GITHUB_TOKEN = options.token;
  process.env.GITHUB_REPOSITORY = options.repository;
  process.env.GITHUB_REF = `refs/pull/${options.issueNumber}/merge`;
  process.env.GITHUB_EVENT_NAME = "pull_request";
  process.env.GITHUB_ACTIONS = "true";

  await postToGitHubPR(comment);
}

// Re-export types
export type { DocAnalysisResult } from "./doc-service.js";
// Re-export formatters for external use
export { formatGitHubComment, formatJSON } from "./formatters.js";

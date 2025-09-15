import { join } from "node:path";
import type { DatabaseService } from "../../core/database/database-service.js";
import {
  getOriginalContent,
  getSectionContent,
  hybridSearch,
  rerankResults,
  semanticSearch,
} from "../../core/search/search.js";
import type { VectorSearchResult } from "../../core/vector-db/adapters/types.js";
import { type QueryToolInput, queryToolSchema } from "../schemas/validation.js";
import {
  type AnalysisMetadata,
  createExecutionContext,
  type ExecutionContext,
  generateAnalysisMetadata,
  generateStrategicHints,
  type StrategicHints,
} from "../utils/metadata-generator.js";
import { findSimilarQuery, saveSuccessfulQuery } from "../utils/query-cache.js";
import { executeQueryChain, type QueryChain } from "../utils/query-chain.js";
import { updateStructuredKnowledge } from "../utils/structured-knowledge.js";
import {
  type BaseToolOptions,
  type BaseToolResult,
  createErrorResponse,
  createSuccessResponse,
  createToolHandler,
} from "../utils/tool-handler.js";

export interface QueryToolOptions extends BaseToolOptions {
  service: DatabaseService;
}

export interface QueryToolResult extends BaseToolResult {
  results?: Array<{
    id: string;
    content: string;
    score: number;
    metadata?: Record<string, unknown>;
  }>;
  // NEW: エージェント支援メタデータ（オプショナル、後方互換性のため）
  analysisMetadata?: AnalysisMetadata;
  strategicHints?: StrategicHints;
  executionContext?: ExecutionContext;
}

/**
 * Create a query chain for strategic multi-stage search
 */
function createQueryChainFromInput(
  query: string,
  options: QueryToolInput,
): QueryChain {
  return {
    topic: query,
    stages: [
      {
        // Stage 1: Precise semantic search for exact matches
        query,
        options: {
          hybrid: false,
          k: 5, // Increased from 3 for better coverage
          rerank: options.rerank !== false,
          type: options.type,
        },
        description: "Initial precise semantic search",
      },
      {
        // Stage 2: Broader search with implementation focus
        query: `${query} implementation architecture design pattern structure`,
        options: {
          hybrid: true,
          k: 5, // Increased from 2 for more diverse results
          rerank: options.rerank !== false,
          type: options.type,
        },
        description: "Broader implementation and architecture details",
      },
      {
        // Stage 3: Related concepts and alternatives
        query: `related to "${query}" OR similar OR alternative approaches`,
        options: {
          hybrid: true,
          k: 3, // Keep smaller for focused related content
          rerank: options.rerank !== false,
          type: options.type,
        },
        description: "Related concepts and alternative approaches",
      },
    ],
  };
}

/**
 * Internal handler for query tool operations
 */
async function handleQueryOperation(
  data: QueryToolInput,
  options: QueryToolOptions,
): Promise<QueryToolResult> {
  const { service } = options;
  const startTime = Date.now();
  const context = createExecutionContext(data.query);

  try {
    // Use query chain if requested
    if (data.useChain) {
      const queryChain = createQueryChainFromInput(data.query, data);
      const chainResult = await executeQueryChain(queryChain, service);

      // Save structured knowledge if requested
      if (data.saveStructured && chainResult.combinedResults.length > 0) {
        // Import buildStructuredResult from query-chain module
        const { buildStructuredResult } = await import(
          "../utils/query-chain.js"
        );

        // Build properly structured knowledge
        const structuredKnowledge = buildStructuredResult(chainResult);

        // Use update instead of save for incremental caching
        const update = {
          content: structuredKnowledge.content,
          metadata: {
            ...structuredKnowledge.metadata,
            queryExecuted: data.query,
            isChainResult: true,
          },
        };
        // Save to queries subdirectory
        const cacheDir = join(process.cwd(), ".gistdex", "cache", "queries");
        await updateStructuredKnowledge(data.query, update, cacheDir);

        console.log(
          `Updated structured knowledge for "${data.query}" with ${chainResult.combinedResults.length} unique results`,
        );
      }

      return createSuccessResponse("Query chain executed successfully", {
        results: chainResult.combinedResults.map((r) => ({
          id: `chain-${Math.random().toString(36).substring(7)}`,
          content: r.content,
          score: r.score || 0,
          metadata: r.metadata,
        })),
      });
    }
    // Check for similar cached query
    const cachedQuery = findSimilarQuery(
      data.query,
      data.hybrid ? "hybrid" : "semantic",
    );

    if (cachedQuery) {
      console.log(`Found similar cached query: "${cachedQuery.query}"`);
    }

    // Perform search
    let results: VectorSearchResult[];
    if (data.hybrid) {
      results = await hybridSearch(
        data.query,
        {
          k: data.k ?? 5,
          sourceType: data.type,
          keywordWeight: 0.3,
        },
        service,
      );
    } else {
      results = await semanticSearch(
        data.query,
        {
          k: data.k ?? 5,
          sourceType: data.type,
        },
        service,
      );
    }

    // Rerank results if requested
    if (data.rerank !== false && results.length > 0) {
      results = rerankResults(data.query, results, {
        boostFactor: 0.1,
      });
    }

    // Get full content if requested
    const finalResults = await Promise.all(
      results.map(async (result) => {
        let content = result.content;

        // Check if this is a markdown file
        const isMarkdownFile =
          result.metadata?.filePath?.endsWith(".md") ||
          result.metadata?.filePath?.endsWith(".mdx");

        // Check for mutually exclusive options
        if (data.full && data.section) {
          throw new Error(
            "Cannot use both 'full' and 'section' options together",
          );
        }

        // Determine if section retrieval should be used
        // 1. If section is explicitly true, use it (if boundary exists)
        // 2. If section is explicitly false, don't use it
        // 3. If section is undefined, auto-apply for markdown files (if boundary exists)
        const shouldUseSection =
          data.section === true
            ? Boolean(result.metadata?.boundary)
            : data.section === false
              ? false
              : data.section === undefined &&
                isMarkdownFile &&
                Boolean(result.metadata?.boundary);

        if (shouldUseSection) {
          try {
            const sectionContent = await getSectionContent(result, service);
            if (sectionContent) {
              content = sectionContent;
              // Log when we auto-apply section retrieval for markdown
              if (!data.section && isMarkdownFile) {
                console.log(
                  `Auto-applied section retrieval for markdown file: ${result.metadata?.filePath || "unknown"}`,
                );
              }
            }
          } catch (error) {
            // Fall back to chunk content if section content retrieval fails
            console.warn(
              `Failed to retrieve section content for result ${result.id}:`,
              error,
            );
          }
        } else if (data.full && result.metadata?.sourceId) {
          try {
            const fullContent = await getOriginalContent(result, service);
            if (fullContent) {
              content = fullContent;
            }
          } catch (error) {
            // Fall back to chunk content if full content retrieval fails
            console.warn(
              `Failed to retrieve full content for result ${result.id}:`,
              error,
            );
          }
        }

        return {
          id: result.id,
          content,
          score: result.score,
          metadata: result.metadata,
        };
      }),
    );

    // Save successful query to cache if results were found
    if (finalResults.length > 0) {
      // Check if any results are markdown files (for cache metadata)
      const hasMarkdownResults = results.some(
        (r) =>
          r.metadata?.filePath?.endsWith(".md") ||
          r.metadata?.filePath?.endsWith(".mdx"),
      );

      // Determine if section was actually used (either explicitly or automatically for markdown)
      const sectionUsed =
        data.section === true ||
        (data.section !== false &&
          hasMarkdownResults &&
          results.some((r) => r.metadata?.boundary));

      await saveSuccessfulQuery(data.query, finalResults, {
        strategy: data.hybrid ? "hybrid" : "semantic",
        useSection: sectionUsed,
        useFull: data.full === true,
      });

      // Save structured knowledge if requested
      if (data.saveStructured) {
        const formattedContent = finalResults
          .map(
            (r, i) =>
              `### Result ${i + 1} (Score: ${r.score.toFixed(3)})\n\n${r.content}`,
          )
          .join("\n\n");

        const update = {
          content: formattedContent,
          metadata: {
            timestamp: new Date().toISOString(),
            searchStrategy: data.hybrid ? "hybrid" : "semantic",
            resultCount: finalResults.length,
            avgScore:
              finalResults.reduce((sum, r) => sum + r.score, 0) /
              finalResults.length,
            queryExecuted: data.query,
          },
        };
        // Save to queries subdirectory
        const cacheDir = join(process.cwd(), ".gistdex", "cache", "queries");
        await updateStructuredKnowledge(data.query, update, cacheDir);
      }
    }

    // Generate metadata if includeMetadata is enabled (or by default for better agent support)
    // This is opt-out rather than opt-in to provide better default experience
    const includeMetadata = data.includeMetadata !== false;
    let analysisMetadata: AnalysisMetadata | undefined;
    let strategicHints: StrategicHints | undefined;

    if (includeMetadata && finalResults.length > 0) {
      // Generate metadata and hints
      analysisMetadata = await generateAnalysisMetadata(data.query, results);
      strategicHints = generateStrategicHints(
        data.query,
        results,
        analysisMetadata,
      );
    }

    // Update execution context
    context.executionTime = Date.now() - startTime;

    // Build response with optional metadata
    const responseData: Omit<QueryToolResult, "success" | "message"> = {
      results: finalResults,
    };

    // Add metadata only if generated
    if (analysisMetadata) {
      responseData.analysisMetadata = analysisMetadata;
    }
    if (strategicHints) {
      responseData.strategicHints = strategicHints;
    }
    if (includeMetadata) {
      responseData.executionContext = context;
    }

    return createSuccessResponse("Search completed successfully", responseData);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return createErrorResponse(`Search failed: ${errorMessage}`, [
      errorMessage,
    ]);
  }
}

/**
 * Public handler for query tool with validation and error handling
 */
export const handleQueryTool = createToolHandler(
  queryToolSchema,
  handleQueryOperation,
);

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
        await updateStructuredKnowledge(data.query, update);

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

        // Check for mutually exclusive options
        if (data.full && data.section) {
          throw new Error(
            "Cannot use both 'full' and 'section' options together",
          );
        }

        if (data.section && result.metadata?.boundary) {
          try {
            const sectionContent = await getSectionContent(result, service);
            if (sectionContent) {
              content = sectionContent;
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
    if (results.length > 0) {
      await saveSuccessfulQuery(data.query, results, {
        strategy: data.hybrid ? "hybrid" : "semantic",
        useSection:
          typeof data.section === "boolean" ? data.section : undefined,
        useFull: typeof data.full === "boolean" ? data.full : undefined,
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
        await updateStructuredKnowledge(data.query, update);
      }
    }

    return createSuccessResponse("Search completed successfully", {
      results: finalResults,
    });
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

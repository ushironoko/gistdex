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
 * Internal handler for query tool operations
 */
async function handleQueryOperation(
  data: QueryToolInput,
  options: QueryToolOptions,
): Promise<QueryToolResult> {
  const { service } = options;

  try {
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

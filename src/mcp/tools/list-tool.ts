import type { DatabaseService } from "../../core/database/database-service.js";
import type {
  FormattedExtension,
  FormattedSource,
} from "../../core/types/list-types.js";
import {
  analyzeItems,
  formatExtensions,
  formatSources,
} from "../../core/utils/source-analyzer.js";
import { type ListToolInput, listToolSchema } from "../schemas/validation.js";
import {
  type BaseToolOptions,
  type BaseToolResult,
  createErrorResponse,
  createSuccessResponse,
  createToolHandler,
} from "../utils/tool-handler.js";

export interface ListToolOptions extends BaseToolOptions {
  service: DatabaseService;
}

export interface ListToolResult extends BaseToolResult {
  items?: Array<{
    id: string;
    content?: string;
    sourceType?: string;
    title?: string;
    metadata?: Record<string, unknown>;
  }>;
  sources?: FormattedSource[];
  extensions?: FormattedExtension[];
  stats?: {
    total?: number;
    totalItems?: number;
    byType?: Record<string, number>;
    bySourceType?: Record<string, number>;
    uniqueSources?: number;
  };
}

/**
 * Internal handler for list tool operations
 */
async function handleListOperation(
  data: ListToolInput,
  options: ListToolOptions,
): Promise<ListToolResult> {
  const { service } = options;

  try {
    // Check if service has the expected methods
    if (!service || typeof service !== "object") {
      throw new Error("Database service not available");
    }

    // Get statistics
    const stats = await service.getStats();

    // If only stats are requested, return early
    if (data.stats) {
      return createSuccessResponse("Statistics retrieved successfully", {
        stats: {
          ...stats,
          uniqueSources: 0, // Will be calculated if needed
        },
      });
    }

    // Get all items for comprehensive analysis
    const queryOptions = {
      limit: data.detailed ? 10000 : (data.limit ?? 1000),
      filter: data.type ? { sourceType: data.type } : undefined,
    };
    const items = await service.listItems(queryOptions);

    // Analyze sources and extensions
    const { sourceMap, extensionMap } = analyzeItems(items);

    const result: ListToolResult = {
      success: true,
      stats: {
        ...stats,
        uniqueSources: sourceMap.size,
      },
    };

    // Return extension analysis if requested
    if (data.byExtension) {
      const sortedExtensions = formatExtensions(extensionMap);

      return createSuccessResponse(
        "Extension statistics retrieved successfully",
        {
          ...result,
          extensions: sortedExtensions,
        },
      );
    }

    // Return source analysis if requested
    if (data.bySource) {
      const sortedSources = formatSources(
        sourceMap,
        data.detailed ? undefined : 10,
      );

      return createSuccessResponse("Sources listed successfully", {
        ...result,
        sources: sortedSources,
      });
    }

    // Default: return formatted items (backward compatibility)
    const formattedItems = items
      .filter((item) => item.id !== undefined)
      .slice(0, data.limit ?? 100)
      .map((item) => ({
        id: item.id as string,
        content: item.content,
        sourceType: item.metadata?.sourceType as string | undefined,
        title: item.metadata?.title as string | undefined,
        metadata: item.metadata as Record<string, unknown> | undefined,
      }));

    return createSuccessResponse("Items listed successfully", {
      ...result,
      items: formattedItems,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return createErrorResponse(`Failed to list items: ${errorMessage}`, [
      errorMessage,
    ]);
  }
}

/**
 * Public handler for list tool with validation and error handling
 */
export const handleListTool = createToolHandler(
  listToolSchema,
  handleListOperation,
);

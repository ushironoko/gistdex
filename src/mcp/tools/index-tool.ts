import type { DatabaseService } from "../../core/database/database-service.js";
import {
  indexFile,
  indexFiles,
  indexGist,
  indexGitHubRepo,
  indexText,
} from "../../core/indexer/indexer.js";
import { type IndexToolInput, indexToolSchema } from "../schemas/validation.js";
import {
  type BaseToolOptions,
  type BaseToolResult,
  createErrorResponse,
  createSuccessResponse,
  createToolHandler,
} from "../utils/tool-handler.js";

export interface IndexToolOptions extends BaseToolOptions {
  service: DatabaseService;
}

export interface IndexToolResult extends BaseToolResult {
  itemsIndexed?: number;
}

/**
 * Internal handler for index tool operations
 */
export async function handleIndexOperation(
  data: IndexToolInput,
  options: IndexToolOptions,
): Promise<IndexToolResult> {
  const { service } = options;

  try {
    const indexOptions = {
      chunkSize: data.chunkSize ?? 1000,
      chunkOverlap: data.chunkOverlap ?? 200,
      preserveBoundaries: Boolean(data.preserveBoundaries ?? false),
    };

    switch (data.type) {
      case "text": {
        if (!data.text) {
          return createErrorResponse("Text content is required for text type");
        }

        if (!data.text.content) {
          return createErrorResponse("Content cannot be empty");
        }

        const result = await indexText(
          data.text.content,
          {
            title: data.text.title,
            ...data.text.metadata,
          },
          indexOptions,
          service,
        );

        return createSuccessResponse("Successfully indexed text content", {
          itemsIndexed: result.chunksCreated,
        });
      }

      case "file": {
        if (!data.file) {
          return createErrorResponse("File path is required for file type");
        }

        const result = await indexFile(
          data.file.path,
          data.file.metadata || {},
          indexOptions,
          service,
        );

        return createSuccessResponse(
          `Successfully indexed file: ${data.file.path}`,
          { itemsIndexed: result.chunksCreated },
        );
      }

      case "files": {
        if (!data.files) {
          return createErrorResponse("Pattern is required for files type");
        }

        const patterns = data.files.pattern.split(",").map((p) => p.trim());
        const result = await indexFiles(
          patterns,
          data.files.metadata || {},
          indexOptions,
          service,
        );

        return createSuccessResponse(
          `Successfully indexed files matching pattern: ${data.files.pattern}`,
          { itemsIndexed: result.chunksCreated },
        );
      }

      case "gist": {
        if (!data.gist) {
          return createErrorResponse("Gist URL is required for gist type");
        }

        const result = await indexGist(data.gist.url, indexOptions, service);

        return createSuccessResponse(
          `Successfully indexed Gist: ${data.gist.url}`,
          { itemsIndexed: result.chunksCreated },
        );
      }

      case "github": {
        if (!data.github) {
          return createErrorResponse("GitHub URL is required for github type");
        }

        const result = await indexGitHubRepo(
          data.github.url,
          indexOptions,
          service,
        );

        return createSuccessResponse(
          `Successfully indexed GitHub repository: ${data.github.url}`,
          { itemsIndexed: result.chunksCreated },
        );
      }

      default:
        return createErrorResponse(`Unknown index type: ${data.type}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return createErrorResponse(`Failed to index content: ${errorMessage}`, [
      errorMessage,
    ]);
  }
}

/**
 * Public handler for index tool with validation and error handling
 */
export const handleIndexTool = createToolHandler(
  indexToolSchema,
  handleIndexOperation,
);

import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import type { ZodType, ZodTypeDef } from "zod";
import type { DatabaseService } from "../../core/database/database-service.js";

/**
 * Base options for all tool handlers
 */
export interface BaseToolOptions {
  service: DatabaseService;
}

/**
 * Base result structure for all tool handlers
 */
export interface BaseToolResult {
  success: boolean;
  message?: string;
  errors?: string[];
}

/**
 * Tool handler function type
 */
export type ToolHandler<
  TInput,
  TOptions extends BaseToolOptions,
  TResult extends BaseToolResult,
> = (input: TInput, options: TOptions) => Promise<TResult>;

/**
 * Creates a tool handler with common validation and error handling
 * Throws McpError for validation failures to properly integrate with MCP protocol
 */
export function createToolHandler<
  TInput,
  TOptions extends BaseToolOptions,
  TResult extends BaseToolResult,
>(
  schema: ZodType<TInput, ZodTypeDef, TInput>,
  handler: ToolHandler<TInput, TOptions, TResult>,
): (input: unknown, options: TOptions) => Promise<TResult> {
  return async (input: unknown, options: TOptions): Promise<TResult> => {
    // Validate input
    const validationResult = schema.safeParse(input);
    if (!validationResult.success) {
      // Throw McpError for invalid parameters
      const errors = validationResult.error.errors.map((e) => e.message);
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid input: ${errors.join(", ")}`,
        { errors },
      );
    }

    try {
      // Call the actual handler with validated input
      return await handler(validationResult.data, options);
    } catch (error) {
      // Re-throw McpError as-is
      if (error instanceof McpError) {
        throw error;
      }

      // Wrap other errors in McpError
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new McpError(
        ErrorCode.InternalError,
        `Operation failed: ${errorMessage}`,
        { originalError: errorMessage },
      );
    }
  };
}

/**
 * Creates a success response with optional data
 */
export function createSuccessResponse<T extends BaseToolResult>(
  message: string,
  additionalData?: Omit<T, keyof BaseToolResult>,
): T {
  return {
    success: true,
    message,
    ...additionalData,
  } as T;
}

/**
 * Creates an error response with optional additional errors
 */
export function createErrorResponse<T extends BaseToolResult>(
  message: string,
  errors?: string[],
): T {
  return {
    success: false,
    message,
    errors,
  } as T;
}

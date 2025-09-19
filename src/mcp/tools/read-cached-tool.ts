import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { getCacheDir } from "../utils/cache-utils.js";
import {
  type BaseToolResult,
  createErrorResponse,
} from "../utils/tool-handler.js";

// Define the input schema for read_cached tool
export const readCachedToolSchema = z.object({
  type: z
    .enum(["queries", "knowledge", "all"])
    .optional()
    .default("all")
    .describe("Type of cache to read"),
  topic: z
    .string()
    .optional()
    .describe("Specific knowledge topic to read (optional)"),
});

export type ReadCachedInput = z.infer<typeof readCachedToolSchema>;

export interface ReadCachedResult extends BaseToolResult {
  queries?: string | null;
  knowledge?: Array<{
    file: string;
    topic: string;
    content: string;
  }>;
}

/**
 * Read cached queries and structured knowledge
 */
export async function handleReadCachedTool(
  args: unknown,
): Promise<ReadCachedResult> {
  try {
    // Validate input
    const data = readCachedToolSchema.parse(args);
    const cacheDir = getCacheDir();
    const result: ReadCachedResult = {
      success: true,
      message: "Successfully read cached content",
      queries: null,
      knowledge: [],
    };

    // Read queries.md if requested
    if (["queries", "all"].includes(data.type)) {
      const queriesPath = join(cacheDir, "queries.md");
      if (existsSync(queriesPath)) {
        result.queries = readFileSync(queriesPath, "utf-8");
      }
    }

    // Read structured knowledge if requested
    if (["knowledge", "all"].includes(data.type)) {
      const knowledgeDir = join(cacheDir, "structured");
      if (existsSync(knowledgeDir)) {
        const files = readdirSync(knowledgeDir).filter((f) =>
          f.endsWith(".md"),
        );

        for (const file of files) {
          // Filter by topic if specified
          if (
            !data.topic ||
            file.toLowerCase().includes(data.topic.toLowerCase())
          ) {
            const content = readFileSync(join(knowledgeDir, file), "utf-8");
            result.knowledge?.push({
              file,
              topic: file.replace(".md", "").replace(/_/g, " "),
              content,
            });
          }
        }
      }
    }

    // Update message based on what was found
    const hasQueries = result.queries !== null;
    const hasKnowledge = result.knowledge && result.knowledge.length > 0;

    if (!hasQueries && !hasKnowledge) {
      result.message = "No cached content found";
    } else if (hasQueries && hasKnowledge) {
      result.message = `Found ${result.knowledge?.length ?? 0} knowledge documents and cached queries`;
    } else if (hasQueries) {
      result.message = "Found cached queries";
    } else if (hasKnowledge) {
      result.message = `Found ${result.knowledge?.length ?? 0} knowledge documents`;
    }

    return result;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse(
        "Invalid input parameters",
        error.errors.map((e) => `${e.path.join(".")}: ${e.message}`),
      );
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    return createErrorResponse(`Failed to read cache: ${errorMessage}`, [
      errorMessage,
    ]);
  }
}

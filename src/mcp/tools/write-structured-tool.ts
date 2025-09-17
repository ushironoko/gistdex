import { join } from "node:path";
import { z } from "zod";
import { getCacheDir } from "../utils/cache-utils.js";
import { saveStructuredKnowledge } from "../utils/structured-knowledge.js";
import {
  type BaseToolResult,
  createErrorResponse,
  createSuccessResponse,
} from "../utils/tool-handler.js";

// Define the input schema for write_structured_result
export const writeStructuredSchema = z.object({
  topic: z.string().min(1).describe("Topic or title for the knowledge"),
  content: z.string().min(1).describe("Structured analysis in markdown format"),
  metadata: z
    .object({
      goal: z.string().optional().describe("The research goal"),
      query: z.string().optional().describe("The search query used"),
      summary: z.string().optional().describe("Brief summary of findings"),
      tags: z.array(z.string()).optional().describe("Tags for categorization"),
    })
    .optional()
    .describe("Optional metadata for the knowledge"),
  directory: z
    .string()
    .optional()
    .describe(
      "Optional directory path for saving (defaults to .gistdex/cache/structured)",
    ),
});

export type WriteStructuredInput = z.infer<typeof writeStructuredSchema>;

export interface WriteStructuredResult extends BaseToolResult {
  savedPath?: string;
  topic?: string;
}

// Write structured doesn't need database service
export type WriteStructuredOptions = {};

/**
 * Internal handler for writing structured knowledge
 */
async function handleWriteStructuredOperation(
  data: WriteStructuredInput,
  _options: WriteStructuredOptions,
): Promise<WriteStructuredResult> {
  try {
    // Determine save directory
    const baseDir = data.directory || join(getCacheDir(), "structured");

    // Prepare the knowledge object
    const knowledge = {
      topic: data.topic,
      content: data.content,
      metadata: {
        ...data.metadata,
        createdBy: "agent",
        createdAt: new Date().toISOString(),
      },
    };

    // Save the structured knowledge
    await saveStructuredKnowledge(knowledge, baseDir);

    // Generate file path for feedback
    const sanitizedTopic = data.topic.replace(/\s+/g, "_");
    const savedPath = join(baseDir, `${sanitizedTopic}.md`);

    return createSuccessResponse(
      `Successfully saved structured knowledge for "${data.topic}"`,
      {
        savedPath,
        topic: data.topic,
      },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return createErrorResponse(
      `Failed to save structured knowledge: ${errorMessage}`,
      [errorMessage],
    );
  }
}

/**
 * Public handler for write structured tool
 * Since this tool doesn't need database service, we handle validation manually
 */
export async function handleWriteStructuredTool(
  args: unknown,
  _options?: unknown,
): Promise<WriteStructuredResult> {
  try {
    // Validate input
    const data = writeStructuredSchema.parse(args);
    return await handleWriteStructuredOperation(data, {});
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse(
        "Invalid input parameters",
        error.errors.map((e) => `${e.path.join(".")}: ${e.message}`),
      );
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    return createErrorResponse(`Tool execution failed: ${errorMessage}`, [
      errorMessage,
    ]);
  }
}

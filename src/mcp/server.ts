// MCP Server implementation
// This module should only be imported and used via the CLI

// Suppress Node.js experimental warnings (especially for SQLite)
// This must be done before any imports that might trigger warnings
process.removeAllListeners("warning");
process.on("warning", (warning) => {
  // Ignore experimental warnings to prevent MCP client disconnection
  if (warning.name === "ExperimentalWarning") {
    return;
  }
  // Log other warnings to stderr for debugging
  console.error(warning.toString());
});

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { createConfigOperations } from "../core/config/config-operations.js";
import { createDatabaseOperations } from "../core/database/database-operations.js";
import type { DatabaseService } from "../core/database/database-service.js";
import { handleAgentQueryTool } from "./tools/agent-query-tool.js";
import { handleIndexTool } from "./tools/index-tool.js";
import { handleListTool } from "./tools/list-tool.js";
import { handleQueryTool } from "./tools/query-tool.js";
import { handleReadCachedTool } from "./tools/read-cached-tool.js";
import { handleWriteStructuredTool } from "./tools/write-structured-tool.js";

// Database service will be initialized per request
let service: DatabaseService | null = null;

// Create MCP server
const server = new Server(
  {
    protocolVersion: "2025-06-18",
    name: "gistdex-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Register tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "gistdex_search",
      description:
        "DEFAULT SEARCH TOOL: Intelligent search with automatic query planning and comprehensive analysis. " +
        "ALWAYS USE THIS FIRST for searching indexed content. " +
        "Automatically provides: metadata analysis, strategic hints, and next action recommendations. " +
        "Features automatic goal tracking, coverage analysis, and quality assessment. " +
        "Supports three response modes: summary (default), detailed, or full. " +
        "When sufficient information is gathered, use the suggested gistdex_write_structured_result tool to save your findings.",
      inputSchema: {
        type: "object",
        properties: {
          goal: {
            type: "string",
            description: "The research goal or question to answer",
          },
          query: {
            type: "string",
            description: "Initial search query text",
          },
          cursor: {
            type: "string",
            description:
              "Pagination cursor for continuing from previous results",
          },
          visitedCache: {
            type: "boolean",
            description: "Whether cache has been visited in this query session",
            default: false,
          },
          context: {
            type: "object",
            properties: {
              previousQueries: {
                type: "array",
                items: { type: "string" },
                description: "Previous queries in this session",
              },
              excludeResults: {
                type: "array",
                items: { type: "string" },
                description: "IDs of results to exclude (already seen)",
              },
              focusAreas: {
                type: "array",
                items: { type: "string" },
                description: "Specific areas to focus on",
              },
            },
          },
          options: {
            type: "object",
            properties: {
              mode: {
                type: "string",
                enum: ["summary", "detailed", "full"],
                default: "summary",
                description:
                  "Response mode: summary (~5K tokens), detailed (~15K tokens), or full (may exceed limits)",
              },
              k: {
                type: "number",
                description:
                  "Number of results per query (max 5 for MCP token limits)",
                default: 5,
                maximum: 5,
              },
              pageSize: {
                type: "number",
                description: "Page size for pagination (max 10)",
                default: 5,
                maximum: 10,
              },
              saveStructured: {
                type: "boolean",
                description:
                  "Save results as structured knowledge in .gistdex/cache/",
                default: false,
              },
            },
          },
          maxIterations: {
            type: "number",
            description: "Maximum number of search iterations",
            default: 5,
          },
          provider: {
            type: "string",
            description: "Vector database provider (e.g., 'sqlite', 'memory')",
          },
          db: {
            type: "string",
            description: "Database file path",
          },
        },
        required: ["goal", "query"],
      },
    },
    {
      name: "gistdex_read_cached",
      description:
        "Read cached queries and structured knowledge from .gistdex/cache directory. " +
        "Use this tool when instructed to review cache before searching. " +
        "Can read previous query history and saved structured knowledge documents.",
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["queries", "knowledge", "all"],
            description: "Type of cache to read (default: all)",
          },
          topic: {
            type: "string",
            description: "Specific knowledge topic to read (optional)",
          },
        },
      },
    },
    {
      name: "gistdex_query_simple",
      description:
        "LOW-LEVEL SEARCH: Manual search with direct control over parameters. " +
        "Use only when gistdex_search doesn't provide needed flexibility. " +
        "For most tasks, prefer gistdex_search instead. " +
        "Provides fine-grained control over: hybrid/semantic mode, reranking, section/full content retrieval. " +
        "BEST PRACTICES: " +
        "1) Use hybrid=true for broad keyword discovery " +
        "2) Use semantic search (hybrid=false) for concept matching " +
        "3) For markdown: use section=true for complete sections " +
        "4) Use full=true only when entire original content is needed",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query text",
          },
          k: {
            type: "number",
            description: "Number of results to return",
            default: 5,
          },
          type: {
            type: "string",
            enum: ["gist", "github", "file", "text"],
            description: "Filter by source type",
          },
          hybrid: {
            type: "boolean",
            description: "Enable hybrid search",
            default: false,
          },
          rerank: {
            type: "boolean",
            description: "Enable result re-ranking",
            default: true,
          },
          full: {
            type: "boolean",
            description: "Return full original content",
            default: false,
          },
          section: {
            type: "boolean",
            description: "Return full section content for markdown files",
            default: false,
          },
          includeMetadata: {
            type: "boolean",
            description: "Include analysis metadata and strategic hints",
            default: true,
          },
          saveStructured: {
            type: "boolean",
            description: "Save results as structured knowledge for future use",
            default: false,
          },
          useChain: {
            type: "boolean",
            description: "Use query chain for multi-stage strategic search",
            default: false,
          },
          provider: {
            type: "string",
            description: "Vector database provider (e.g., 'sqlite', 'memory')",
          },
          db: {
            type: "string",
            description: "Database file path",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "gistdex_index",
      description:
        "Index content from various sources with intelligent chunking. " +
        "BEST PRACTICES: " +
        "1) ALWAYS use preserveBoundaries=true for semantic structure preservation. " +
        "2) Use larger chunks (2000-3000) for documentation, smaller (500-1000) for code. " +
        "3) For markdown: preserveBoundaries maintains heading hierarchy. " +
        "4) For code: preserveBoundaries respects function/class boundaries. " +
        "5) Index incrementally - don't re-index already indexed content unless updated.",
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["text", "file", "files", "gist", "github"],
            description: "Type of content to index",
          },
          text: {
            type: "object",
            properties: {
              content: { type: "string", description: "Text content to index" },
              title: { type: "string", description: "Optional title" },
              metadata: { type: "object", description: "Optional metadata" },
            },
          },
          file: {
            type: "object",
            properties: {
              path: { type: "string", description: "File path to index" },
              metadata: { type: "object", description: "Optional metadata" },
            },
          },
          files: {
            type: "object",
            properties: {
              pattern: {
                type: "string",
                description: "Glob pattern for files",
              },
              metadata: { type: "object", description: "Optional metadata" },
            },
          },
          gist: {
            type: "object",
            properties: {
              url: { type: "string", description: "GitHub Gist URL" },
              metadata: { type: "object", description: "Optional metadata" },
            },
          },
          github: {
            type: "object",
            properties: {
              url: { type: "string", description: "GitHub repository URL" },
              metadata: { type: "object", description: "Optional metadata" },
            },
          },
          chunkSize: {
            type: "number",
            description: "Size of text chunks",
            default: 1000,
          },
          chunkOverlap: {
            type: "number",
            description: "Overlap between chunks",
            default: 200,
          },
          preserveBoundaries: {
            type: "boolean",
            description:
              "Preserve semantic boundaries when chunking (recommended: true)",
            default: true,
          },
          provider: {
            type: "string",
            description: "Vector database provider (e.g., 'sqlite', 'memory')",
          },
          db: {
            type: "string",
            description: "Database file path",
          },
        },
        required: ["type"],
      },
    },
    {
      name: "gistdex_list",
      description:
        "List indexed items with optional filtering and grouping. " +
        "Use stats=true for statistics only, byExtension=true for extension grouping, " +
        "bySource=true for source grouping (default), detailed=true for all sources. " +
        "Check what content is already indexed to avoid redundant indexing.",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of items to return",
            default: 100,
          },
          type: {
            type: "string",
            enum: ["gist", "github", "file", "text"],
            description: "Filter by source type",
          },
          stats: {
            type: "boolean",
            description: "Return statistics only",
            default: false,
          },
          byExtension: {
            type: "boolean",
            description: "Group results by file extension",
            default: false,
          },
          bySource: {
            type: "boolean",
            description: "Group results by source (default behavior)",
            default: false,
          },
          detailed: {
            type: "boolean",
            description: "Show all sources instead of top 10",
            default: false,
          },
          provider: {
            type: "string",
            description: "Vector database provider (e.g., 'sqlite', 'memory')",
          },
          db: {
            type: "string",
            description: "Database file path",
          },
        },
      },
    },
    {
      name: "gistdex_write_structured_result",
      description:
        "Save your analysis and findings as structured knowledge. " +
        "Use this after gathering sufficient information through searches. " +
        "Write comprehensive markdown-formatted content with your own insights, analysis, and conclusions. " +
        "This tool allows you to create permanent knowledge artifacts from your research.",
      inputSchema: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            description: "Topic or title for the knowledge document",
          },
          content: {
            type: "string",
            description:
              "Your structured analysis in markdown format. Include sections, headings, lists, code blocks as needed.",
          },
          metadata: {
            type: "object",
            description: "Optional metadata to include with the knowledge",
            properties: {
              goal: {
                type: "string",
                description: "The original research goal or question",
              },
              query: {
                type: "string",
                description: "Main search query used",
              },
              summary: {
                type: "string",
                description: "Brief one-paragraph summary of findings",
              },
              tags: {
                type: "array",
                items: { type: "string" },
                description:
                  "Tags for categorization (e.g., 'api', 'tutorial', 'architecture')",
              },
            },
          },
          directory: {
            type: "string",
            description:
              "Optional custom directory path (defaults to .gistdex/cache/structured)",
          },
        },
        required: ["topic", "content"],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // Get configuration
    const configOps = createConfigOperations();
    const config = await configOps.load();

    // Check if database config is overridden by the tool arguments
    let dbConfig = config.vectorDB;
    if (args && typeof args === "object") {
      const { provider, db } = args as { provider?: string; db?: string };
      if (provider || db) {
        dbConfig = {
          ...config.vectorDB,
          provider: provider || config.vectorDB?.provider || "sqlite",
          options: {
            ...config.vectorDB?.options,
            ...(db && { path: db }),
          },
        };
      }
    }

    // Use database operations for proper resource management
    const dbOps = createDatabaseOperations(dbConfig);

    return await dbOps.withDatabase(async (dbService) => {
      service = dbService;

      switch (name) {
        case "gistdex_search": {
          const result = await handleAgentQueryTool(args, { service });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "gistdex_read_cached": {
          const result = await handleReadCachedTool(args);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "gistdex_query_simple": {
          const result = await handleQueryTool(args, { service });
          if (!result.success) {
            return {
              content: [
                {
                  type: "text",
                  text: `❌ ${result.message}\n${
                    result.errors?.join("\n") || ""
                  }`,
                },
              ],
            };
          }

          const results = result.results || [];
          const formattedResults = results
            .map((r, i) => {
              const metadata = r.metadata
                ? `\nMetadata: ${JSON.stringify(r.metadata, null, 2)}`
                : "";
              return `\n${i + 1}. Score: ${r.score.toFixed(3)}\n${
                r.content
              }${metadata}`;
            })
            .join("\n---");

          return {
            content: [
              {
                type: "text",
                text: `Found ${results.length} results:${formattedResults}`,
              },
            ],
          };
        }

        case "gistdex_index": {
          const result = await handleIndexTool(args, { service });
          return {
            content: [
              {
                type: "text",
                text: result.success
                  ? `✅ ${result.message}\nIndexed ${result.itemsIndexed} chunks.`
                  : `❌ ${result.message}\n${result.errors?.join("\n") || ""}`,
              },
            ],
          };
        }

        case "gistdex_list": {
          const result = await handleListTool(args, { service });
          if (!result.success) {
            return {
              content: [
                {
                  type: "text",
                  text: `❌ ${result.message}\n${
                    result.errors?.join("\n") || ""
                  }`,
                },
              ],
            };
          }

          if (result.stats && !result.items) {
            // Stats only mode
            const stats = result.stats;
            const byType = Object.entries(stats.bySourceType || {})
              .map(([type, count]) => `  ${type}: ${count}`)
              .join("\n");
            return {
              content: [
                {
                  type: "text",
                  text: `📊 Statistics:\nTotal items: ${stats.totalItems}\nBy type:\n${byType}`,
                },
              ],
            };
          }

          const items = result.items || [];
          const formattedItems = items
            .map((item, i) => {
              const type = item.sourceType || "unknown";
              const title = item.title || "Untitled";
              return `${i + 1}. [${type}] ${title}`;
            })
            .join("\n");

          const statsText = result.stats
            ? `\n\n📊 Total: ${result.stats.totalItems} items`
            : "";

          return {
            content: [
              {
                type: "text",
                text: `📚 Indexed items:\n${formattedItems}${statsText}`,
              },
            ],
          };
        }

        case "gistdex_write_structured_result": {
          // Write structured result doesn't need database service, but pass empty options for consistency
          const result = await handleWriteStructuredTool(args, {});
          return {
            content: [
              {
                type: "text",
                text: result.success
                  ? `✅ ${result.message}\nSaved to: ${result.savedPath}`
                  : `❌ ${result.message}`,
              },
            ],
          };
        }

        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    });
  } catch (error) {
    // Re-throw McpError as-is (SDK will handle it properly)
    if (error instanceof McpError) {
      throw error;
    }

    // Wrap unexpected errors in McpError
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new McpError(ErrorCode.InternalError, errorMessage, {
      originalError: errorMessage,
    });
  }
});

// Start MCP server - this should only be called from the CLI
export async function startMCPServer() {
  try {
    // Print initialization message with best practices
    console.error("🚀 Gistdex MCP Server initialized");
    console.error("📚 Best Practices:");
    console.error(
      "  1. Index with preserveBoundaries=true for semantic structure",
    );
    console.error("  2. Use multi-stage queries: hybrid → semantic → section");
    console.error("  3. Query cache enabled at .gistdex/cache/");
    console.error("");

    // Create and connect transport
    const transport = new StdioServerTransport();
    // Connect to transport and keep the process alive
    await server.connect(transport);
  } catch (error) {
    console.error("MCP Server startup error:", error);
  }
}

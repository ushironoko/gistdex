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
import { handleIndexTool } from "./tools/index-tool.js";
import { handleListTool } from "./tools/list-tool.js";
import { handleQueryTool } from "./tools/query-tool.js";

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
      name: "gistdex_index",
      description:
        "Index content from various sources (text, file, gist, github)",
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
            description: "Preserve semantic boundaries when chunking",
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
        required: ["type"],
      },
    },
    {
      name: "gistdex_query",
      description: "Search indexed content using semantic or hybrid search",
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
      name: "gistdex_list",
      description: "List indexed items with optional filtering",
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

        case "gistdex_query": {
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
    // Create and connect transport
    const transport = new StdioServerTransport();
    // Connect to transport and keep the process alive
    await server.connect(transport);
  } catch (error) {
    console.error("MCP Server startup error:", error);
  }
}

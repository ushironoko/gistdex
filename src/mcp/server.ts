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
import { handleQueryPlanTool } from "./tools/query-plan-tool.js";
import { handleQueryTool } from "./tools/query-tool.js";
import { ensureCacheDirectories } from "./utils/query-cache.js";

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
      name: "gistdex_query",
      description:
        "Search indexed content using multi-stage query strategy. " +
        "BEST PRACTICES: " +
        "1) Stage 1: Use hybrid=true for broad keyword discovery to find relevant domains. " +
        "2) Stage 2: Use semantic search (hybrid=false) on specific topics from Stage 1. " +
        "3) Stage 3+: For markdown content, use section=true to get complete sections (mutually exclusive with full=true). " +
        "4) The 'section' option retrieves the full semantic section (e.g., entire markdown heading section). " +
        "5) Build structured knowledge incrementally by combining results from multiple queries. " +
        "6) Use higher k values (10-20) for comprehensive coverage, lower (3-5) for focused results. " +
        "NEW FEATURES: " +
        "- Use 'useChain=true' to automatically execute a 3-stage query chain for comprehensive results. " +
        "- Use 'saveStructured=true' to save search results as structured knowledge for future reference. " +
        "- Query chains perform: semantic search → hybrid search → extended concept search. " +
        "- Structured knowledge is cached in .gistdex/cache/ for improved LLM context reuse.",
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
      name: "gistdex_list",
      description:
        "List indexed items with optional filtering. " +
        "Use stats=true to get overview before querying. " +
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
      name: "gistdex_query_plan",
      description:
        "Execute a query plan with automatic evaluation and refinement. " +
        "This tool enforces a structured workflow for LLM agents: " +
        "1) Plan queries to achieve a specific goal " +
        "2) Define expected results beforehand " +
        "3) Execute queries iteratively " +
        "4) Evaluate results against expectations " +
        "5) Refine queries until satisfactory results are achieved " +
        "6) Save structured knowledge to cache. " +
        "Use this for complex information gathering tasks that require multiple iterations and quality assurance.",
      inputSchema: {
        type: "object",
        properties: {
          goal: {
            type: "string",
            description:
              "The user's final goal (e.g., 'Understanding VitePress configuration')",
          },
          initialQueries: {
            type: "array",
            items: { type: "string" },
            description: "Initial query candidates to try",
          },
          maxIterations: {
            type: "number",
            description: "Maximum number of iterations to try",
            default: 5,
          },
          evaluationMode: {
            type: "string",
            enum: ["strict", "fuzzy", "semantic"],
            description: "Mode for evaluating results",
            default: "semantic",
          },
          saveIntermediateResults: {
            type: "boolean",
            description: "Whether to save intermediate results",
            default: true,
          },
          expectedResults: {
            type: "object",
            properties: {
              keywords: {
                type: "array",
                items: { type: "string" },
                description: "Required keywords in results",
              },
              minMatches: {
                type: "number",
                description: "Minimum number of matching results",
              },
              contentPatterns: {
                type: "array",
                items: { type: "string" },
                description: "Expected content patterns (regex strings)",
              },
              confidence: {
                type: "number",
                description: "Confidence threshold (0-1)",
              },
            },
            description: "Expected results criteria",
          },
          strategy: {
            type: "object",
            properties: {
              initialMode: {
                type: "string",
                enum: ["broad", "specific"],
                description: "Initial query strategy",
                default: "broad",
              },
              refinementMethod: {
                type: "string",
                enum: ["keywords", "semantic", "hybrid"],
                description: "Query refinement method",
                default: "hybrid",
              },
              expansionRules: {
                type: "array",
                items: { type: "string" },
                description: "Query expansion rules",
              },
            },
            description: "Search strategy configuration",
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
        required: ["goal"],
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

        case "gistdex_query_plan": {
          const result = await handleQueryPlanTool(args, { service });
          if (!("success" in result) || !result.success) {
            return {
              content: [
                {
                  type: "text",
                  text: `❌ Query plan failed${
                    "message" in result ? `: ${result.message}` : ""
                  }`,
                },
              ],
            };
          }

          const planResult = result.result;
          const summary = planResult.summary || "Query plan completed";
          const details = [
            summary,
            "",
            `Status: ${planResult.status}`,
            `Iterations: ${planResult.iterations.length}`,
            `Final confidence: ${planResult.finalResults.confidence.toFixed(2)}`,
            `Results found: ${planResult.finalResults.data.length}`,
          ];

          if (planResult.savedAt) {
            details.push(`Plan saved: ${planResult.savedAt}`);
          }
          if (planResult.structuredKnowledgePath) {
            details.push(
              `Knowledge saved: ${planResult.structuredKnowledgePath}`,
            );
          }

          return {
            content: [
              {
                type: "text",
                text: details.join("\n"),
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
    // Ensure cache directories exist
    await ensureCacheDirectories();

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

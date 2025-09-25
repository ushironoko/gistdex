import { z } from "zod";

// Common database configuration schemas
export const databaseConfigSchema = z.object({
  provider: z
    .string()
    .optional()
    .describe("Vector database provider (e.g., 'sqlite', 'memory', 'duckdb')"),
  db: z.string().optional().describe("Database file path"),
});

// Index tool schemas
export const indexTextSchema = z.object({
  content: z.string().describe("The text content to index"),
  title: z.string().optional().describe("Optional title for the content"),
  metadata: z.record(z.string()).optional().describe("Optional metadata"),
});

export const indexFileSchema = z.object({
  path: z.string().describe("Path to the file to index"),
  metadata: z.record(z.string()).optional().describe("Optional metadata"),
});

export const indexFilesSchema = z.object({
  pattern: z
    .string()
    .describe("Glob pattern for files to index (e.g., 'src/**/*.ts')"),
  metadata: z.record(z.string()).optional().describe("Optional metadata"),
});

export const indexGistSchema = z.object({
  url: z.string().url().describe("GitHub Gist URL"),
  metadata: z.record(z.string()).optional().describe("Optional metadata"),
});

export const indexGitHubSchema = z.object({
  url: z.string().url().describe("GitHub repository or file URL"),
  metadata: z.record(z.string()).optional().describe("Optional metadata"),
});

export const indexToolSchema = z.object({
  type: z
    .enum(["text", "file", "files", "gist", "github"])
    .describe("Type of content to index"),
  text: indexTextSchema.optional(),
  file: indexFileSchema.optional(),
  files: indexFilesSchema.optional(),
  gist: indexGistSchema.optional(),
  github: indexGitHubSchema.optional(),
  chunkSize: z
    .number()
    .int()
    .positive()
    .optional()
    .default(1000)
    .describe("Size of text chunks for indexing"),
  chunkOverlap: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .default(200)
    .describe("Overlap between chunks"),
  preserveBoundaries: z
    .union([
      z.boolean(),
      z.string().transform((val) => val === "true" || val === "1"),
      z.number().transform((val) => val !== 0),
    ])
    .optional()
    .default(true)
    .describe("Preserve semantic boundaries when chunking"),
  provider: z
    .string()
    .optional()
    .describe("Vector database provider (e.g., 'sqlite', 'memory', 'duckdb')"),
  db: z.string().optional().describe("Database file path"),
});

// Query tool schemas
export const queryToolSchema = z.object({
  query: z.string().min(1).describe("Search query text"),
  k: z
    .number()
    .int()
    .positive()
    .optional()
    .default(5)
    .describe("Number of results to return"),
  type: z
    .enum(["gist", "github", "file", "text"])
    .optional()
    .describe("Filter results by source type"),
  hybrid: z
    .union([
      z.boolean(),
      z.string().transform((val) => val === "true" || val === "1"),
      z.number().transform((val) => val !== 0),
    ])
    .optional()
    .default(false)
    .describe("Enable hybrid search (semantic + keyword)"),
  rerank: z
    .union([
      z.boolean(),
      z.string().transform((val) => val === "true" || val === "1"),
      z.number().transform((val) => val !== 0),
    ])
    .optional()
    .default(true)
    .describe("Enable result re-ranking"),
  full: z
    .union([
      z.boolean(),
      z.string().transform((val) => val === "true" || val === "1"),
      z.number().transform((val) => val !== 0),
    ])
    .optional()
    .default(false)
    .describe("Return full original content"),
  section: z
    .union([
      z.boolean(),
      z.string().transform((val) => val === "true" || val === "1"),
      z.number().transform((val) => val !== 0),
    ])
    .optional()
    .describe("Return full section content for markdown files"),
  saveStructured: z
    .union([
      z.boolean(),
      z.string().transform((val) => val === "true" || val === "1"),
      z.number().transform((val) => val !== 0),
    ])
    .optional()
    .default(false)
    .describe("Save results as structured knowledge for future use"),
  useChain: z
    .union([
      z.boolean(),
      z.string().transform((val) => val === "true" || val === "1"),
      z.number().transform((val) => val !== 0),
    ])
    .optional()
    .default(false)
    .describe("Use query chain for multi-stage strategic search"),
  includeMetadata: z
    .union([
      z.boolean(),
      z.string().transform((val) => val === "true" || val === "1"),
      z.number().transform((val) => val !== 0),
    ])
    .optional()
    .default(true)
    .describe(
      "Include analysis metadata and strategic hints for agent support",
    ),
  provider: z
    .string()
    .optional()
    .describe("Vector database provider (e.g., 'sqlite', 'memory', 'duckdb')"),
  db: z.string().optional().describe("Database file path"),
});

// List tool schemas
export const listToolSchema = z.object({
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .default(100)
    .describe("Maximum number of items to return"),
  type: z
    .enum(["gist", "github", "file", "text"])
    .optional()
    .describe("Filter items by source type"),
  stats: z
    .union([
      z.boolean(),
      z.string().transform((val) => val === "true" || val === "1"),
      z.number().transform((val) => val !== 0),
    ])
    .optional()
    .default(false)
    .describe("Return statistics only"),
  byExtension: z
    .union([
      z.boolean(),
      z.string().transform((val) => val === "true" || val === "1"),
      z.number().transform((val) => val !== 0),
    ])
    .optional()
    .default(false)
    .describe("Group results by file extension"),
  bySource: z
    .union([
      z.boolean(),
      z.string().transform((val) => val === "true" || val === "1"),
      z.number().transform((val) => val !== 0),
    ])
    .optional()
    .default(false)
    .describe("Group results by source (default behavior)"),
  detailed: z
    .union([
      z.boolean(),
      z.string().transform((val) => val === "true" || val === "1"),
      z.number().transform((val) => val !== 0),
    ])
    .optional()
    .default(false)
    .describe("Show all sources instead of top 10"),
  provider: z
    .string()
    .optional()
    .describe("Vector database provider (e.g., 'sqlite', 'memory', 'duckdb')"),
  db: z.string().optional().describe("Database file path"),
});

// Info tool schemas
export const infoToolSchema = z.object({});

// Query Plan tool schemas
export const queryPlanToolSchema = z.object({
  goal: z
    .string()
    .min(1)
    .describe(
      "The user's final goal (e.g., 'Understanding VitePress configuration')",
    ),
  initialQueries: z
    .array(z.string())
    .optional()
    .describe("Initial query candidates to try"),
  maxIterations: z
    .number()
    .int()
    .positive()
    .optional()
    .default(5)
    .describe("Maximum number of iterations to try"),
  evaluationMode: z
    .enum(["strict", "fuzzy", "semantic"])
    .optional()
    .default("semantic")
    .describe("Mode for evaluating results"),
  saveIntermediateResults: z
    .union([
      z.boolean(),
      z.string().transform((val) => val === "true" || val === "1"),
      z.number().transform((val) => val !== 0),
    ])
    .optional()
    .default(true)
    .describe("Whether to save intermediate results"),
  expectedResults: z
    .object({
      keywords: z
        .array(z.string())
        .optional()
        .describe("Required keywords in results"),
      minMatches: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Minimum number of matching results"),
      contentPatterns: z
        .array(z.string())
        .optional()
        .describe("Expected content patterns (regex strings)"),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Confidence threshold (0-1)"),
    })
    .optional()
    .describe("Expected results criteria"),
  strategy: z
    .object({
      initialMode: z
        .enum(["broad", "specific"])
        .optional()
        .default("broad")
        .describe("Initial query strategy"),
      refinementMethod: z
        .enum(["keywords", "semantic", "hybrid"])
        .optional()
        .default("hybrid")
        .describe("Query refinement method"),
      expansionRules: z
        .array(z.string())
        .optional()
        .describe("Query expansion rules"),
    })
    .optional()
    .describe("Search strategy configuration"),
  provider: z
    .string()
    .optional()
    .describe("Vector database provider (e.g., 'sqlite', 'memory', 'duckdb')"),
  db: z.string().optional().describe("Database file path"),
  timeoutSeconds: z
    .number()
    .int()
    .positive()
    .min(10)
    .max(300)
    .optional()
    .default(120)
    .describe(
      "Timeout in seconds for the entire plan execution (default: 120, min: 10, max: 300)",
    ),
});

// Agent Query tool schemas
export const agentQueryToolSchema = z.object({
  query: z.string().min(1).describe("Search query text"),
  goal: z
    .string()
    .min(1)
    .describe("The agent's final goal for this search session"),
  cursor: z
    .string()
    .optional()
    .describe("Pagination cursor for continuing from previous results"),
  visitedCache: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether cache has been visited in this query session"),
  context: z
    .object({
      previousQueries: z
        .array(z.string())
        .optional()
        .describe("Previous queries in this session"),
      excludeResults: z
        .array(z.string())
        .optional()
        .describe("IDs of results to exclude (already seen)"),
      focusAreas: z
        .array(z.string())
        .optional()
        .describe("Specific areas to focus on"),
    })
    .optional()
    .describe("Context from previous iterations"),
  options: z
    .object({
      mode: z
        .enum(["summary", "detailed", "full"])
        .optional()
        .default("summary")
        .describe(
          "Response mode: summary (~5K tokens), detailed (~15K tokens), or full (may exceed limits)",
        ),
      k: z
        .number()
        .int()
        .positive()
        .max(5) // MCPトークン制限対策：最大5件に制限
        .optional()
        .default(5) // デフォルトも5に変更
        .describe("Number of results to return (max 5 for MCP token limits)"),
      pageSize: z
        .number()
        .int()
        .positive()
        .max(10)
        .optional()
        .default(5)
        .describe("Page size for pagination (max 10)"),
      hybrid: z
        .union([
          z.boolean(),
          z.string().transform((val) => val === "true" || val === "1"),
          z.number().transform((val) => val !== 0),
        ])
        .optional()
        .default(false)
        .describe("Enable hybrid search"),
      rerank: z
        .union([
          z.boolean(),
          z.string().transform((val) => val === "true" || val === "1"),
          z.number().transform((val) => val !== 0),
        ])
        .optional()
        .default(true)
        .describe("Enable result reranking"),
      includeDebug: z
        .union([
          z.boolean(),
          z.string().transform((val) => val === "true" || val === "1"),
          z.number().transform((val) => val !== 0),
        ])
        .optional()
        .default(false)
        .describe("Include debug information"),
      saveStructured: z
        .union([
          z.boolean(),
          z.string().transform((val) => val === "true" || val === "1"),
          z.number().transform((val) => val !== 0),
        ])
        .optional()
        .default(false)
        .describe("Save results as structured knowledge in .gistdex/cache/"),
    })
    .optional()
    .describe("Search options"),
  provider: z
    .string()
    .optional()
    .describe("Vector database provider (e.g., 'sqlite', 'memory', 'duckdb')"),
  db: z.string().optional().describe("Database file path"),
});

// Type exports
export type IndexToolInput = z.input<typeof indexToolSchema>;
export type QueryToolInput = z.input<typeof queryToolSchema>;
export type ListToolInput = z.input<typeof listToolSchema>;
export type InfoToolInput = z.infer<typeof infoToolSchema>;
export type QueryPlanToolInput = z.input<typeof queryPlanToolSchema>;
export type AgentQueryToolInput = z.input<typeof agentQueryToolSchema>;

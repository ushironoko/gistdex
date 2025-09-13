import { z } from "zod";

// Common database configuration schemas
export const databaseConfigSchema = z.object({
  provider: z
    .string()
    .optional()
    .describe("Vector database provider (e.g., 'sqlite', 'memory')"),
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
    .describe("Vector database provider (e.g., 'sqlite', 'memory')"),
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
  provider: z
    .string()
    .optional()
    .describe("Vector database provider (e.g., 'sqlite', 'memory')"),
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
  provider: z
    .string()
    .optional()
    .describe("Vector database provider (e.g., 'sqlite', 'memory')"),
  db: z.string().optional().describe("Database file path"),
});

// Info tool schemas
export const infoToolSchema = z.object({});

// Type exports
export type IndexToolInput = z.input<typeof indexToolSchema>;
export type QueryToolInput = z.input<typeof queryToolSchema>;
export type ListToolInput = z.input<typeof listToolSchema>;
export type InfoToolInput = z.infer<typeof infoToolSchema>;

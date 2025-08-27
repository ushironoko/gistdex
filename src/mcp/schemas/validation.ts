import { z } from "zod";

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
    .boolean()
    .optional()
    .default(false)
    .describe("Preserve semantic boundaries when chunking"),
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
    .boolean()
    .optional()
    .default(false)
    .describe("Enable hybrid search (semantic + keyword)"),
  rerank: z
    .boolean()
    .optional()
    .default(true)
    .describe("Enable result re-ranking"),
  full: z
    .boolean()
    .optional()
    .default(false)
    .describe("Return full original content"),
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
    .boolean()
    .optional()
    .default(false)
    .describe("Return statistics only"),
});

// Info tool schemas
export const infoToolSchema = z.object({});

// Type exports
export type IndexToolInput = z.input<typeof indexToolSchema>;
export type QueryToolInput = z.input<typeof queryToolSchema>;
export type ListToolInput = z.input<typeof listToolSchema>;
export type InfoToolInput = z.infer<typeof infoToolSchema>;

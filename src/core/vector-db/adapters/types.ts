/**
 * Functional vector database types
 */

/**
 * Metadata that can be attached to vector documents
 */
export interface DocumentMetadata {
  // Source identification
  sourceId?: string;
  sourceType?: "gist" | "github" | "file" | "text";

  // Content chunking
  chunkIndex?: number;
  totalChunks?: number;
  originalContent?: string; // Stored in first chunk for backward compatibility

  // Document information
  title?: string;
  url?: string;
  description?: string;

  // File-specific metadata
  filePath?: string;

  // GitHub-specific metadata
  owner?: string;
  repo?: string;
  branch?: string;
  path?: string;

  // Gist-specific metadata
  gistId?: string;

  // Timestamps
  createdAt?: string;
  updatedAt?: string;

  // Testing and other metadata
  type?: string; // Used in tests
  version?: number; // Used in tests
  test?: boolean; // Used in tests
  updated?: boolean; // Used in tests

  // Allow additional properties for extensibility
  [key: string]: unknown;
}

export interface VectorDocument {
  id?: string;
  content: string;
  embedding: number[];
  metadata?: DocumentMetadata;
}

export interface VectorSearchResult {
  id: string;
  content: string;
  score: number;
  metadata?: DocumentMetadata;
}

export interface SearchOptions {
  k?: number;
  filter?: Record<string, unknown>;
}

export interface ListOptions {
  limit?: number;
  offset?: number;
  filter?: Record<string, unknown>;
}

export interface VectorDBAdapter {
  initialize: () => Promise<void>;
  insert: (document: VectorDocument) => Promise<string>;
  insertBatch: (documents: VectorDocument[]) => Promise<string[]>;
  search: (
    embedding: number[],
    options?: SearchOptions,
  ) => Promise<VectorSearchResult[]>;
  update: (id: string, document: Partial<VectorDocument>) => Promise<void>;
  delete: (id: string) => Promise<void>;
  deleteBatch: (ids: string[]) => Promise<void>;
  get: (id: string) => Promise<VectorDocument | null>;
  count: (filter?: Record<string, unknown>) => Promise<number>;
  list: (options?: ListOptions) => Promise<VectorDocument[]>;
  close: () => Promise<void>;
  getInfo: () => {
    provider: string;
    version: string;
    capabilities: string[];
  };
}

export interface VectorDBConfig {
  provider: string;
  options?: Record<string, unknown>;
}

export type AdapterFactory = (
  config: VectorDBConfig,
) => VectorDBAdapter | Promise<VectorDBAdapter>;

export type AdapterMiddleware = (adapter: VectorDBAdapter) => VectorDBAdapter;

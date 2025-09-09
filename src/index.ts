/**
 * @ushironoko/gistdex - RAG search system with pluggable vector database support
 *
 * This module provides the public API for the gistdex library.
 */

// Chunking functions
export { chunkTextWithCST } from "./core/chunk/chunking.js";
export { defineGistdexConfig } from "./core/config/config-helpers.js";
// Configuration
export {
  createConfigOperations,
  type GistdexConfig,
} from "./core/config/config-operations.js";
export { createDatabaseOperations } from "./core/database/database-operations.js";
// Main API - Database service
export { createDatabaseService } from "./core/database/database-service.js";
// Indexing functions
export {
  type IndexOptions,
  type IndexResult,
  indexFile,
  indexGist,
  indexGitHubRepo,
  indexText,
} from "./core/indexer/indexer.js";
// Search functions
export { hybridSearch, semanticSearch } from "./core/search/search.js";
export {
  createBaseAdapter,
  type StorageOperations,
} from "./core/vector-db/adapters/base-adapter.js";
export { createFactory } from "./core/vector-db/adapters/factory.js";
export { createMemoryAdapter } from "./core/vector-db/adapters/memory-adapter.js";
export {
  createRegistry,
  type RegistryInterface,
} from "./core/vector-db/adapters/registry.js";
// Custom adapter creation
export {
  withCustomRegistry,
  withRegistry,
} from "./core/vector-db/adapters/registry-operations.js";

// Built-in adapters (for direct use or reference)
export { createSQLiteAdapter } from "./core/vector-db/adapters/sqlite-adapter.js";
// Types for vector database
export type {
  DocumentMetadata,
  ListOptions,
  SearchOptions,
  VectorDBAdapter,
  VectorDBConfig,
  VectorDocument,
  VectorSearchResult,
} from "./core/vector-db/adapters/types.js";

// Error types
export {
  DatabaseNotInitializedError,
  DocumentNotFoundError,
  InvalidDimensionError,
  VectorDBError,
} from "./core/vector-db/errors.js";

import { DocumentNotFoundError, VectorDBError } from "../errors.js";
import { generateDocumentId, validateDimension } from "../utils/validation.js";
import { createBatchOperations } from "./common-operations.js";
import type {
  ListOptions,
  SearchOptions,
  VectorDBAdapter,
  VectorDocument,
  VectorSearchResult,
} from "./types.js";

/**
 * Base adapter configuration
 */
export interface BaseAdapterConfig {
  dimension: number;
  provider: string;
  version: string;
  capabilities: string[];
}

/**
 * Abstract storage interface that concrete adapters must implement
 */
export interface StorageOperations {
  storeDocument: (doc: VectorDocument) => Promise<string>;
  retrieveDocument: (id: string) => Promise<VectorDocument | null>;
  removeDocument: (id: string) => Promise<void>;
  searchSimilar: (
    embedding: number[],
    options?: SearchOptions,
  ) => Promise<VectorSearchResult[]>;
  countDocuments: (filter?: Record<string, unknown>) => Promise<number>;
  listDocuments: (options?: ListOptions) => Promise<VectorDocument[]>;
  clear: () => Promise<void>;
}

/**
 * Create a base adapter with common functionality
 * This reduces code duplication between adapter implementations
 */
export function createBaseAdapter(
  config: BaseAdapterConfig,
  storage: StorageOperations,
): VectorDBAdapter {
  const { dimension, provider, version, capabilities } = config;
  const batchOps = createBatchOperations();
  let initialized = false;

  // Common validation helper
  const ensureInitialized = (): void => {
    if (!initialized) {
      throw new VectorDBError("Adapter not initialized");
    }
  };

  // Common document creation with validation
  const prepareDocument = (document: VectorDocument): VectorDocument => {
    const id = generateDocumentId(document.id);
    validateDimension(document.embedding, dimension);

    return {
      ...document,
      id,
      metadata: {
        ...document.metadata,
        createdAt: document.metadata?.createdAt || new Date().toISOString(),
      },
    };
  };

  return {
    async initialize(): Promise<void> {
      if (initialized) return;
      // Storage-specific initialization can be done in storage implementation
      initialized = true;
    },

    async insert(document: VectorDocument): Promise<string> {
      ensureInitialized();
      const preparedDoc = prepareDocument(document);
      return storage.storeDocument(preparedDoc);
    },

    async insertBatch(documents: VectorDocument[]): Promise<string[]> {
      ensureInitialized();
      return batchOps.insertBatch(documents, (doc) => this.insert(doc));
    },

    async search(
      embedding: number[],
      options?: SearchOptions,
    ): Promise<VectorSearchResult[]> {
      ensureInitialized();
      validateDimension(embedding, dimension);
      return storage.searchSimilar(embedding, options);
    },

    async get(id: string): Promise<VectorDocument | null> {
      ensureInitialized();
      return storage.retrieveDocument(id);
    },

    async update(id: string, updates: Partial<VectorDocument>): Promise<void> {
      ensureInitialized();

      const existing = await storage.retrieveDocument(id);
      if (!existing) {
        throw new DocumentNotFoundError(id);
      }

      if (updates.embedding) {
        validateDimension(updates.embedding, dimension);
      }

      const updated: VectorDocument = {
        ...existing,
        ...updates,
        id: existing.id, // Keep original ID
        metadata: {
          ...existing.metadata,
          ...updates.metadata,
          updatedAt: new Date().toISOString(),
        },
      };

      await storage.storeDocument(updated);
    },

    async delete(id: string): Promise<void> {
      ensureInitialized();

      const existing = await storage.retrieveDocument(id);
      if (!existing) {
        throw new DocumentNotFoundError(id);
      }

      await storage.removeDocument(id);
    },

    async deleteBatch(ids: string[]): Promise<void> {
      ensureInitialized();
      await batchOps.deleteBatch(ids, (id) => this.delete(id));
    },

    async count(filter?: Record<string, unknown>): Promise<number> {
      ensureInitialized();
      return storage.countDocuments(filter);
    },

    async list(options?: ListOptions): Promise<VectorDocument[]> {
      ensureInitialized();
      return storage.listDocuments(options);
    },

    async close(): Promise<void> {
      // Don't clear data on close - that deletes all stored data!
      // clear() should only be called when explicitly wanting to delete data
      initialized = false;
    },

    getInfo() {
      return {
        provider,
        version,
        capabilities,
      };
    },
  };
}

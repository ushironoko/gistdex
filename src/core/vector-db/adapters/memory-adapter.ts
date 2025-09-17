import { randomUUID } from "node:crypto";
import { cosineSimilarity } from "../../embedding/embedding.js";
import { VECTOR_DB_CONSTANTS } from "../constants.js";
import { DocumentNotFoundError } from "../errors.js";
import { applyMetadataFilter } from "../utils/filter.js";
import { validateDimension } from "../utils/validation.js";
import { createBatchOperations } from "./common-operations.js";
import type {
  ListOptions,
  SearchOptions,
  VectorDBAdapter,
  VectorDBConfig,
  VectorDocument,
  VectorSearchResult,
} from "./types.js";

/**
 * Create an in-memory vector database adapter using closure pattern
 */
export const createMemoryAdapter = (
  config: VectorDBConfig,
): VectorDBAdapter => {
  // Private state using closure
  const documents = new Map<string, VectorDocument>();
  const dimension =
    config.options?.dimension ?? VECTOR_DB_CONSTANTS.DEFAULT_DIMENSION;
  const batchOps = createBatchOperations();

  // Implementation of adapter methods
  const initialize = async (): Promise<void> => {
    // No initialization needed for in-memory storage
  };

  const insert = async (document: VectorDocument): Promise<string> => {
    const id = document.id || randomUUID();
    validateDimension(document.embedding, dimension as number);

    documents.set(id, {
      ...document,
      id,
    });

    return id;
  };

  const insertBatch = async (docs: VectorDocument[]): Promise<string[]> => {
    return batchOps.insertBatch(docs, insert);
  };

  const search = async (
    embedding: number[],
    options?: SearchOptions,
  ): Promise<VectorSearchResult[]> => {
    const k = options?.k ?? VECTOR_DB_CONSTANTS.DEFAULT_SEARCH_K;

    // Calculate similarities for all documents
    const results: Array<{ doc: VectorDocument; score: number }> = [];

    for (const doc of documents.values()) {
      // Apply metadata filter if provided
      if (
        options?.filter &&
        !applyMetadataFilter(doc.metadata || {}, options.filter)
      ) {
        continue;
      }

      // Skip if embedding dimensions don't match
      if (embedding.length !== doc.embedding.length) {
        console.warn(
          `Skipping document ${doc.id}: embedding dimension mismatch (query: ${embedding.length}, doc: ${doc.embedding.length})`,
        );
        continue;
      }
      const score = cosineSimilarity(embedding, doc.embedding);
      results.push({ doc, score });
    }

    // Sort by score (descending) and take top k
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, k).map(({ doc, score }) => ({
      id: doc.id ?? "",
      content: doc.content,
      score,
      metadata: doc.metadata,
    }));
  };

  const update = async (
    id: string,
    partial: Partial<VectorDocument>,
  ): Promise<void> => {
    const existing = documents.get(id);
    if (!existing) {
      throw new DocumentNotFoundError(id);
    }

    if (partial.embedding) {
      validateDimension(partial.embedding, dimension as number);
    }

    documents.set(id, {
      ...existing,
      ...partial,
      id,
    });
  };

  const deleteDoc = async (id: string): Promise<void> => {
    if (!documents.has(id)) {
      throw new DocumentNotFoundError(id);
    }
    documents.delete(id);
  };

  const deleteBatch = async (ids: string[]): Promise<void> => {
    return batchOps.deleteBatch(ids, deleteDoc);
  };

  const get = async (id: string): Promise<VectorDocument | null> => {
    return documents.get(id) || null;
  };

  const count = async (filter?: Record<string, unknown>): Promise<number> => {
    if (!filter) {
      return documents.size;
    }

    let matchCount = 0;
    for (const doc of documents.values()) {
      if (applyMetadataFilter(doc.metadata || {}, filter)) {
        matchCount++;
      }
    }
    return matchCount;
  };

  const list = async (options?: ListOptions): Promise<VectorDocument[]> => {
    const limit = options?.limit ?? 10;
    const offset = options?.offset ?? 0;

    let docs = Array.from(documents.values());

    // Apply filter if provided
    if (options?.filter) {
      const filter = options.filter;
      docs = docs.filter((doc) =>
        applyMetadataFilter(doc.metadata || {}, filter),
      );
    }

    // Apply pagination
    return docs.slice(offset, offset + limit);
  };

  const close = async (): Promise<void> => {
    documents.clear();
  };

  const getInfo = () => ({
    provider: "memory",
    version: "1.0.0",
    capabilities: ["vector-search", "metadata-filter", "batch-operations"],
  });

  // Return the adapter interface
  return {
    initialize,
    insert,
    insertBatch,
    search,
    update,
    delete: deleteDoc,
    deleteBatch,
    get,
    count,
    list,
    close,
    getInfo,
  };
};

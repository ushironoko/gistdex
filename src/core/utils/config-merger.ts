import { createDefu, defu } from "defu";
import type { GistdexConfig } from "../config/config-operations.js";
import type { VectorDBConfig } from "../vector-db/adapters/types.js";

/**
 * Merge multiple Gistdex configurations with proper priority
 * Left-most arguments have higher priority
 */
export const mergeGistdexConfig = (
  ...configs: Partial<GistdexConfig>[]
): GistdexConfig => {
  return defu({}, ...configs) as GistdexConfig;
};

/**
 * Merge multiple VectorDB configurations
 */
export const mergeVectorDBConfig = (
  ...configs: Partial<VectorDBConfig>[]
): VectorDBConfig => {
  return defu({}, ...configs) as VectorDBConfig;
};

/**
 * Custom merger that replaces arrays instead of concatenating them
 * Useful when you want to completely override array values
 */
export const mergeWithArrayReplace = createDefu((obj, key, value) => {
  if (Array.isArray(value)) {
    obj[key] = value;
    return true;
  }
  return false;
});

/**
 * Get default Gistdex configuration
 */
export const getDefaultGistdexConfig = (): GistdexConfig => {
  return {
    vectorDB: {
      provider: "sqlite",
      options: {
        path: "./gistdex.db",
        dimension: 768,
      },
    },
    embedding: {
      model: "gemini-embedding-001",
      dimension: 768,
    },
    indexing: {
      chunkSize: 1000,
      chunkOverlap: 200,
      batchSize: 100,
      preserveBoundaries: true,
    },
    search: {
      defaultK: 10,
      enableRerank: true,
      rerankBoostFactor: 1.5,
      hybridKeywordWeight: 0.3,
    },
  };
};

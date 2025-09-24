/**
 * Base SQLite adapter that uses base-adapter.ts with SQLite-specific storage operations
 */

import { VECTOR_DB_CONSTANTS } from "../constants.js";
import { VectorDBError } from "../errors.js";
import { createBaseAdapter } from "./base-adapter.js";
import { createSQLiteSchema } from "./sqlite-schema.js";
import {
  createSQLiteStorageOperations,
  type SQLiteOperations,
} from "./sqlite-storage-operations.js";
import type { VectorDBAdapter, VectorDBConfig } from "./types.js";

/**
 * Configuration for SQLite-based adapters
 */
export interface BaseSQLiteConfig {
  config: VectorDBConfig;
  initializeConnection: () => Promise<SQLiteOperations>;
  prepareEmbeddingForInsert?: (embedding: Float32Array) => Float32Array;
  vectorInsertSQL?: string;
  vectorUpdateSQL?: string;
  vectorSearchSQL?: string;
  providerName: string;
}

/**
 * Create a base SQLite adapter using the base-adapter pattern
 */
export const createSQLiteAdapterBase = async ({
  config,
  initializeConnection,
  prepareEmbeddingForInsert = (e) => e,
  vectorInsertSQL,
  vectorUpdateSQL,
  vectorSearchSQL,
  providerName,
}: BaseSQLiteConfig): Promise<VectorDBAdapter> => {
  const dimension =
    config.options?.dimension ?? VECTOR_DB_CONSTANTS.DEFAULT_DIMENSION;
  let db: SQLiteOperations | null = null;
  let baseAdapter: VectorDBAdapter | null = null;

  // Initialize function that sets up the database
  const initialize = async (): Promise<void> => {
    try {
      // Initialize SQLite connection
      db = await initializeConnection();

      // Create schema
      const schemaSQL = createSQLiteSchema(Number(dimension));
      // Use exec if available, otherwise split and run each statement
      if (db.exec) {
        db.exec(schemaSQL);
      } else {
        // Split SQL statements and execute each one
        const statements = schemaSQL.split(";").filter((stmt) => stmt.trim());
        for (const stmt of statements) {
          if (stmt.trim()) {
            db.prepare(`${stmt};`).run();
          }
        }
      }

      // Create StorageOperations
      const storage = createSQLiteStorageOperations(
        db,
        Number(dimension),
        prepareEmbeddingForInsert,
        vectorInsertSQL,
        vectorUpdateSQL,
        vectorSearchSQL,
      );

      // Create base adapter
      baseAdapter = createBaseAdapter(
        {
          dimension: Number(dimension),
          provider: providerName,
          version: "1.0.0",
          capabilities: [
            "vector-search",
            "metadata-filter",
            "batch-operations",
            "sqlite-vec",
            "sources-table",
            "extension-stats",
          ],
        },
        storage,
      );

      // Initialize the base adapter
      await baseAdapter.initialize();
    } catch (error) {
      console.error(`${providerName} initialization error:`, error);
      throw new VectorDBError(
        `Failed to initialize ${providerName} vector database`,
        { cause: error },
      );
    }
  };

  // Close function that properly shuts down the database
  const close = async (): Promise<void> => {
    if (baseAdapter) {
      await baseAdapter.close();
    }
    if (db?.isOpen()) {
      db.close();
    }
    db = null;
    baseAdapter = null;
  };

  // Return the adapter with SQLite-specific overrides
  return {
    initialize,

    // Delegate all standard operations to base adapter
    insert: async (document) => {
      if (!baseAdapter) throw new VectorDBError("Adapter not initialized");
      return baseAdapter.insert(document);
    },

    insertBatch: async (documents) => {
      if (!baseAdapter) throw new VectorDBError("Adapter not initialized");
      return baseAdapter.insertBatch(documents);
    },

    get: async (id) => {
      if (!baseAdapter) throw new VectorDBError("Adapter not initialized");
      return baseAdapter.get(id);
    },

    update: async (id, updates) => {
      if (!baseAdapter) throw new VectorDBError("Adapter not initialized");
      return baseAdapter.update(id, updates);
    },

    delete: async (id) => {
      if (!baseAdapter) throw new VectorDBError("Adapter not initialized");
      return baseAdapter.delete(id);
    },

    deleteBatch: async (ids) => {
      if (!baseAdapter) throw new VectorDBError("Adapter not initialized");
      return baseAdapter.deleteBatch(ids);
    },

    search: async (embedding, options) => {
      if (!baseAdapter) throw new VectorDBError("Adapter not initialized");
      return baseAdapter.search(embedding, options);
    },

    list: async (options) => {
      if (!baseAdapter) throw new VectorDBError("Adapter not initialized");
      return baseAdapter.list(options);
    },

    count: async (filter) => {
      if (!baseAdapter) throw new VectorDBError("Adapter not initialized");
      return baseAdapter.count(filter);
    },

    close,

    getInfo: () => {
      if (!baseAdapter) throw new VectorDBError("Adapter not initialized");
      return baseAdapter.getInfo();
    },
  };
};

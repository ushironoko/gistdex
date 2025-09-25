/**
 * Node.js SQLite adapter using node:sqlite with sqlite-vec extension
 */

import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import * as sqliteVec from "sqlite-vec";
import {
  createErrorHandler,
  createFactoryWithDefaults,
} from "../../utils/factory-helper.js";
import { VectorDBError } from "../errors.js";
import { createSQLiteAdapterBase } from "./base-sqlite-adapter.js";
import type { SQLiteOperations } from "./sqlite-storage-operations.js";
import type { VectorDBAdapter, VectorDBConfig } from "./types.js";

/**
 * Creates SQLiteOperations for Node.js DatabaseSync
 */
const createNodeSQLiteOperations = (db: DatabaseSync): SQLiteOperations => {
  let isOpenFlag = true;

  return {
    exec(sql: string): void {
      db.exec(sql);
    },

    prepare(sql: string) {
      const stmt = db.prepare(sql);
      return {
        run(...params: unknown[]) {
          const result = stmt.run(...(params as SQLInputValue[]));
          return result as { lastInsertRowid: number | bigint };
        },
        get(...params: unknown[]) {
          return stmt.get(...(params as SQLInputValue[]));
        },
        all(...params: unknown[]) {
          return stmt.all(...(params as SQLInputValue[])) as unknown[];
        },
      };
    },

    close(): void {
      db.close();
      isOpenFlag = false;
    },

    isOpen(): boolean {
      return isOpenFlag;
    },
  };
};

// Default configuration for SQLite adapter
const defaultSQLiteConfig: Partial<VectorDBConfig> = {
  options: {
    path: ":memory:",
  },
};

// Error handler for SQLite adapter
const handleSQLiteError = createErrorHandler("SQLite adapter");

/**
 * Internal creator function with actual implementation
 */
const createSQLiteAdapterInternal = async (
  config: VectorDBConfig,
): Promise<VectorDBAdapter> => {
  const dbPath = config.options?.path || ":memory:";

  // Initialize database connection
  const db = new DatabaseSync(String(dbPath), {
    allowExtension: true,
  });

  // Load sqlite-vec extension
  try {
    db.loadExtension(sqliteVec.getLoadablePath());
  } catch (extError) {
    db.close();
    throw new VectorDBError(
      `Failed to load sqlite-vec extension: ${
        extError instanceof Error ? extError.message : String(extError)
      }`,
      { cause: extError },
    );
  }

  // Create and return adapter using base implementation
  return await createSQLiteAdapterBase({
    config,
    initializeConnection: async () => createNodeSQLiteOperations(db),
    providerName: "sqlite",
  });
};

/**
 * Create SQLite adapter for Node.js
 * @param config - Vector database configuration
 * @returns Promise<VectorDBAdapter>
 */
export const createSQLiteAdapter = async (
  config: VectorDBConfig,
): Promise<VectorDBAdapter> => {
  try {
    // Use factory helper with defaults
    const factoryWithDefaults = createFactoryWithDefaults(
      defaultSQLiteConfig,
      createSQLiteAdapterInternal,
    );
    return await factoryWithDefaults(config);
  } catch (error) {
    throw handleSQLiteError(error);
  }
};

// Factory function for async consistency
export default createSQLiteAdapter;

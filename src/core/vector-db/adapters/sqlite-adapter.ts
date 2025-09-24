/**
 * Node.js SQLite adapter using node:sqlite with sqlite-vec extension
 */

import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import * as sqliteVec from "sqlite-vec";
import { VectorDBError } from "../errors.js";
import { createSQLiteAdapterBase } from "./base-sqlite-adapter.js";
import type { SQLiteOperations } from "./sqlite-storage-operations.js";
import type { VectorDBAdapter, VectorDBConfig } from "./types.js";

/**
 * Creates SQLiteOperations implementation for node:sqlite DatabaseSync
 * Uses function composition and closure instead of class
 */
const createNodeSQLiteOperations = (db: DatabaseSync): SQLiteOperations => {
  // Track open state in closure
  let isOpenFlag = true;

  return {
    exec(sql: string): void {
      db.exec(sql);
    },

    prepare(sql: string) {
      const stmt = db.prepare(sql);
      return {
        run(...params: unknown[]) {
          // Cast to SQLInputValue[] for node:sqlite
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
      if (!isOpenFlag) return false;

      // Double-check by trying to prepare a simple statement
      try {
        db.prepare("SELECT 1").get();
        return true;
      } catch {
        isOpenFlag = false;
        return false;
      }
    },
  };
};

/**
 * Create a SQLite vector database adapter using Node.js sqlite module
 * This adapter uses node:sqlite (requires Node.js 24.6.0+ to avoid ExperimentalWarning)
 */
export const createSQLiteAdapter = async (
  config: VectorDBConfig,
): Promise<VectorDBAdapter> => {
  const dbPath = config.options?.path ?? ":memory:";

  const initializeConnection = async (): Promise<SQLiteOperations> => {
    try {
      // Create database connection with node:sqlite
      // Enable extension loading for sqlite-vec
      const db = new DatabaseSync(String(dbPath), {
        allowExtension: true,
      });

      // Load sqlite-vec extension for vector operations
      try {
        db.loadExtension(sqliteVec.getLoadablePath());
      } catch (extError) {
        // Close the database connection before throwing error
        db.close();

        // Provide clear error message with suggestions
        const errorMessage = `SQLite vector extension (sqlite-vec) could not be loaded. 

This is likely because:
1. The sqlite-vec extension file is missing or incompatible
2. Your system doesn't support SQLite extensions

Suggestions:
1. Use the memory adapter instead: --provider memory
2. Ensure sqlite-vec is properly installed: npm install sqlite-vec
3. Try rebuilding native modules: npm rebuild sqlite-vec

Original error: ${
          extError instanceof Error ? extError.message : String(extError)
        }`;

        throw new VectorDBError(errorMessage, {
          cause: extError,
        });
      }

      return createNodeSQLiteOperations(db);
    } catch (error) {
      throw new VectorDBError("Failed to initialize SQLite connection", {
        cause: error,
      });
    }
  };

  return await createSQLiteAdapterBase({
    config,
    initializeConnection,
    providerName: "sqlite",
  });
};

/**
 * Bun SQLite adapter using Bun's built-in SQLite module with sqlite-vec extension
 */

import { VectorDBError } from "../errors.js";
import { createSQLiteAdapterBase } from "./base-sqlite-adapter.js";
import { SQLiteQueries } from "./sqlite-schema.js";
import type { SQLiteOperations } from "./sqlite-storage-operations.js";
import type { VectorDBAdapter, VectorDBConfig } from "./types.js";

// Type definitions for Bun's SQLite
interface BunDatabase {
  prepare(sql: string): BunStatement;
  run(sql: string): void;
  close(): void;
  loadExtension(path: string): void;
}

interface BunStatement {
  run(...params: unknown[]): { lastInsertRowid: number | bigint };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

/**
 * Creates SQLiteOperations for Bun SQLite
 */
const createBunSQLiteOperations = (db: BunDatabase): SQLiteOperations => {
  let isOpenFlag = true;

  return {
    exec(sql: string): void {
      db.run(sql);
    },

    prepare(sql: string) {
      const stmt = db.prepare(sql);
      return {
        run(...params: unknown[]) {
          return stmt.run(...params);
        },
        get(...params: unknown[]) {
          return stmt.get(...params);
        },
        all(...params: unknown[]) {
          return stmt.all(...params);
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

/**
 * Create Bun SQLite adapter
 * @param config - Vector database configuration
 * @returns Promise<VectorDBAdapter>
 */
export const createBunSQLiteAdapter = async (
  config: VectorDBConfig,
): Promise<VectorDBAdapter> => {
  // Runtime check
  if (typeof globalThis.Bun === "undefined") {
    throw new VectorDBError(
      "Bun runtime is required for bun-sqlite adapter. Use sqlite adapter for Node.js.",
    );
  }

  const dbPath = config.options?.path || ":memory:";

  try {
    // Dynamic import for Bun's SQLite module
    const { Database } = await import("bun:sqlite");

    // Initialize database with Bun's SQLite
    const db = new Database(String(dbPath), { create: true });

    // Configure SQLite for extensions if needed
    if (process.platform === "darwin") {
      // macOS: Use custom SQLite if available
      const customSqlitePathOption = config.options?.customSqlitePath;
      const customSqlitePath =
        (typeof customSqlitePathOption === "string"
          ? customSqlitePathOption
          : undefined) ||
        process.env.CUSTOM_SQLITE_PATH ||
        "/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib";

      const { existsSync } = await import("node:fs");
      if (existsSync(customSqlitePath)) {
        Database.setCustomSQLite(customSqlitePath);
      }
    }

    // Load sqlite-vec extension
    try {
      const sqliteVecPathOption = config.options?.sqliteVecPath;
      const sqliteVecPath =
        (typeof sqliteVecPathOption === "string"
          ? sqliteVecPathOption
          : undefined) || process.env.SQLITE_VEC_PATH;

      if (sqliteVecPath) {
        db.loadExtension(sqliteVecPath);
      } else {
        // Try to get path from sqlite-vec package
        const sqliteVec = await import("sqlite-vec");
        db.loadExtension(sqliteVec.getLoadablePath());
      }
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
      initializeConnection: async () => createBunSQLiteOperations(db),
      prepareEmbeddingForInsert: (embedding) => embedding,
      vectorInsertSQL: SQLiteQueries.INSERT_VECTOR_BUN,
      vectorUpdateSQL: SQLiteQueries.UPDATE_VECTOR_BUN,
      vectorSearchSQL: "vec_f32(?)",
      providerName: "bun-sqlite",
    });
  } catch (error) {
    throw new VectorDBError(
      `Failed to create Bun SQLite adapter: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
};

// Factory function for async consistency
export default createBunSQLiteAdapter;

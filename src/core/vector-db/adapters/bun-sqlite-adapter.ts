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
  exec(sql: string): void;
  close(): void;
  loadExtension(path: string): void;
}

interface BunStatement {
  run(...params: unknown[]): { lastInsertRowid: number | bigint };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

/**
 * Creates SQLiteOperations implementation for Bun SQLite
 * Uses function composition and closure instead of class
 */
const createBunSQLiteOperations = (db: BunDatabase): SQLiteOperations => {
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
 * Creates a Bun-specific SQLite adapter for vector database operations.
 * This adapter uses Bun's built-in SQLite module with sqlite-vec extension.
 *
 * @param config - Vector database configuration
 * @returns VectorDBAdapter implementation for Bun SQLite
 */
export const createBunSQLiteAdapter = async (
  config: VectorDBConfig,
): Promise<VectorDBAdapter> => {
  const dbPath = config.options?.path ?? "./gistdex.db";

  const initializeConnection = async (): Promise<SQLiteOperations> => {
    try {
      // Check if running in Bun runtime
      if (typeof Bun === "undefined") {
        throw new VectorDBError(
          "Bun SQLite adapter requires Bun runtime. Please use Node.js SQLite adapter for Node.js environment.",
        );
      }

      // Dynamic import of bun:sqlite
      const { Database } = await import("bun:sqlite");

      // Platform-specific SQLite configuration
      if (process.platform === "darwin") {
        // On macOS, use vanilla SQLite that supports extensions
        const customSqlitePathOption = config.options?.customSqlitePath;
        const customSqlitePath =
          (typeof customSqlitePathOption === "string"
            ? customSqlitePathOption
            : undefined) || process.env.CUSTOM_SQLITE_PATH;
        if (customSqlitePath) {
          Database.setCustomSQLite(customSqlitePath);
        } else {
          // Try common Homebrew locations
          const { existsSync } = await import("node:fs");
          const possiblePaths = [
            "/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib", // ARM Mac (Homebrew)
            "/usr/local/opt/sqlite/lib/libsqlite3.dylib", // Intel Mac (Homebrew)
            "/opt/homebrew/lib/libsqlite3.dylib", // Alternative ARM location
            "/usr/local/lib/libsqlite3.dylib", // Alternative Intel location
          ];

          let sqliteFound = false;
          for (const path of possiblePaths) {
            if (existsSync(path)) {
              Database.setCustomSQLite(path);
              sqliteFound = true;
              break;
            }
          }

          if (!sqliteFound) {
            throw new VectorDBError(
              `Vanilla SQLite not found for Bun on macOS. 

macOS ships with Apple's SQLite which doesn't support extensions.
To use Bun SQLite adapter with vector operations, you need to:

1. Install vanilla SQLite via Homebrew:
   brew install sqlite

2. Set CUSTOM_SQLITE_PATH environment variable to the .dylib path:
   export CUSTOM_SQLITE_PATH=/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib

3. Or use the Node.js adapter instead:
   export VECTOR_DB_PROVIDER=sqlite

The adapter looked for SQLite in these locations:
${possiblePaths.join("\n")}`,
            );
          }
        }
      } else if (process.platform === "linux") {
        // Linux (including WSL) typically has SQLite with extension support
        // But we can allow custom path if needed
        const customSqlitePathOption = config.options?.customSqlitePath;
        const customSqlitePath =
          (typeof customSqlitePathOption === "string"
            ? customSqlitePathOption
            : undefined) || process.env.CUSTOM_SQLITE_PATH;
        if (customSqlitePath) {
          Database.setCustomSQLite(customSqlitePath);
        }
        // On Linux, Bun's default SQLite usually supports extensions
      } else if (process.platform === "win32") {
        // Windows might need custom SQLite path
        const customSqlitePathOption = config.options?.customSqlitePath;
        const customSqlitePath =
          (typeof customSqlitePathOption === "string"
            ? customSqlitePathOption
            : undefined) || process.env.CUSTOM_SQLITE_PATH;
        if (customSqlitePath) {
          Database.setCustomSQLite(customSqlitePath);
        }
        // Note: Windows users may need to install SQLite with extension support
      }

      // Ensure parent directory exists for file-based databases
      const dbPathStr = String(dbPath);
      if (dbPathStr !== ":memory:" && !dbPathStr.startsWith(":")) {
        const { dirname } = await import("node:path");
        const { mkdir } = await import("node:fs/promises");
        const parentDir = dirname(dbPathStr);
        await mkdir(parentDir, { recursive: true }).catch(() => {
          // Ignore error if directory already exists
        });
      }

      // Create database connection with Bun's SQLite
      const db = new Database(dbPathStr, { create: true }) as BunDatabase;

      // Load sqlite-vec extension for vector operations
      try {
        // Try to load sqlite-vec extension
        const sqliteVecPathOption = config.options?.sqliteVecPath;
        let sqliteVecPath =
          (typeof sqliteVecPathOption === "string"
            ? sqliteVecPathOption
            : undefined) || process.env.SQLITE_VEC_PATH;

        if (!sqliteVecPath) {
          // Use sqlite-vec's getLoadablePath() method to auto-detect the correct path
          try {
            const sqliteVec = await import("sqlite-vec");
            sqliteVecPath = sqliteVec.getLoadablePath();
          } catch (_importError) {
            throw new Error(
              "sqlite-vec package not found. Please install it with: bun add sqlite-vec",
            );
          }
        }

        if (!sqliteVecPath) {
          throw new Error("Could not determine sqlite-vec extension path");
        }

        db.loadExtension(sqliteVecPath);
      } catch (extError) {
        // Close the database connection before throwing error
        db.close();

        // Provide clear error message with suggestions
        const errorMessage = `SQLite vector extension (sqlite-vec) could not be loaded in Bun. 

This is likely because:
1. The sqlite-vec extension is not installed or not found
2. The extension path is incorrect
3. Bun's SQLite doesn't have extension loading enabled

Suggestions:
1. Install sqlite-vec for Bun: bun add sqlite-vec
2. Set SQLITE_VEC_PATH environment variable to the correct path
3. Use Database.setCustomSQLite() with a compatible SQLite build
4. Use the Node.js adapter instead: --provider sqlite-node

Original error: ${
          extError instanceof Error ? extError.message : String(extError)
        }`;

        throw new VectorDBError(errorMessage, {
          cause: extError,
        });
      }

      return createBunSQLiteOperations(db);
    } catch (error) {
      throw new VectorDBError("Failed to initialize Bun SQLite connection", {
        cause: error,
      });
    }
  };

  // Bun SQLite requires vec_f32 wrapper for vector operations
  const prepareEmbeddingForInsert = (embedding: Float32Array) => embedding;

  return await createSQLiteAdapterBase({
    config,
    initializeConnection,
    prepareEmbeddingForInsert,
    vectorInsertSQL: SQLiteQueries.INSERT_VECTOR_BUN,
    vectorUpdateSQL: SQLiteQueries.UPDATE_VECTOR_BUN,
    vectorSearchSQL: "vec_f32(?)",
    providerName: "bun-sqlite",
  });
};

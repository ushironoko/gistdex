/**
 * DuckDB Adapter for Vector Database
 * Provides vector similarity search using DuckDB with optional HNSW support
 */

import { randomUUID } from "node:crypto";
import type { DuckDBConnection } from "@duckdb/node-api";
import { VectorDBError } from "../errors.js";
import type { StorageOperations } from "./base-adapter.js";
import { createBaseAdapter } from "./base-adapter.js";
import type {
  ListOptions,
  SearchOptions,
  VectorDBAdapter,
  VectorDBConfig,
  VectorDocument,
  VectorSearchResult,
} from "./types.js";

/**
 * DuckDB configuration options
 */
export interface DuckDBConfig extends VectorDBConfig {
  options: {
    path: string;
    dimension: number;
    enableHNSW?: boolean; // Enable HNSW indexing (default: false)
    hnswMetric?: "l2sq" | "ip" | "cosine"; // HNSW distance metric (default: 'cosine')
    hnswPersistence?: boolean; // Enable experimental HNSW persistence (default: false)
  };
}

// Type for DuckDB instance (from @duckdb/node-api)
interface DuckDBInstance {
  connect(): Promise<DuckDBConnection>;
  closeSync(): void;
}

// Global instance cache to ensure single connection per database file
const instanceCache = new Map<
  string,
  {
    instance: DuckDBInstance;
    connection: DuckDBConnection;
    refCount: number;
  }
>();

/**
 * Get or create a DuckDB instance for the given path
 */
const getOrCreateInstance = async (
  dbPath: string,
  config: DuckDBConfig["options"],
): Promise<{ instance: DuckDBInstance; connection: DuckDBConnection }> => {
  // Check if instance already exists
  const cached = instanceCache.get(dbPath);
  if (cached) {
    cached.refCount++;
    return { instance: cached.instance, connection: cached.connection };
  }

  // Lazy load DuckDB module
  let DuckDBModule: typeof import("@duckdb/node-api");
  try {
    DuckDBModule = await import("@duckdb/node-api");
  } catch (error) {
    throw new VectorDBError(
      "Failed to load @duckdb/node-api. Please ensure it is installed.",
      { cause: error },
    );
  }

  // Create new instance with explicit READ_WRITE mode
  const instance = await DuckDBModule.DuckDBInstance.create(dbPath, {
    access_mode: "READ_WRITE",
  });
  const connection = await instance.connect();

  // Initialize database schema and extensions
  await initializeDuckDB(connection, config);

  // Cache the instance
  instanceCache.set(dbPath, {
    instance,
    connection,
    refCount: 1,
  });

  return { instance, connection };
};

/**
 * Release a DuckDB instance
 */
const releaseInstance = async (dbPath: string): Promise<void> => {
  const cached = instanceCache.get(dbPath);
  if (cached) {
    cached.refCount--;
    if (cached.refCount <= 0) {
      // Close and remove from cache
      try {
        // Force a checkpoint to ensure all data is written
        await cached.connection.run("FORCE CHECKPOINT");
        cached.connection.closeSync();
        cached.instance.closeSync();
      } catch (error) {
        console.warn("Error closing DuckDB instance:", error);
      }
      instanceCache.delete(dbPath);
    }
  }
};

/**
 * Create DuckDB storage operations
 */
const createDuckDBStorageOperations = async (
  dbPath: string,
  config: DuckDBConfig["options"],
): Promise<{ storage: StorageOperations }> => {
  // Get or create instance
  const { connection } = await getOrCreateInstance(dbPath, config);

  // Return storage operations
  const storage: StorageOperations = {
    storeDocument: async (doc: VectorDocument): Promise<string> => {
      const id = doc.id || randomUUID();
      const metadataStr = doc.metadata ? JSON.stringify(doc.metadata) : null;

      // Convert array to SQL array literal with FLOAT casting (DuckDB doesn't support array parameter binding)
      const embeddingStr = `[${doc.embedding
        .map((v) => `${v}::FLOAT`)
        .join(", ")}]`;

      // Properly escape single quotes for SQL
      const escapedId = id.replace(/'/g, "''");
      const escapedContent = doc.content.replace(/'/g, "''");
      const escapedMetadata = metadataStr
        ? `'${metadataStr.replace(/'/g, "''")}'`
        : "NULL";

      // Insert data without transaction
      const sql = `
        INSERT OR REPLACE INTO vectors (id, content, metadata, embedding, created_at, updated_at)
        VALUES ('${escapedId}', '${escapedContent}', ${escapedMetadata}, ${embeddingStr}, NOW(), NOW())
      `;

      await connection.run(sql);

      // Force flush to disk after insert
      await connection.run("FORCE CHECKPOINT");

      return id;
    },

    retrieveDocument: async (id: string): Promise<VectorDocument | null> => {
      const result = await connection.runAndReadAll(
        `SELECT id, content, metadata, embedding FROM vectors WHERE id = '${id.replace(
          /'/g,
          "''",
        )}'`,
      );
      await result.readAll();
      const rows = result.getRows();

      if (!rows || rows.length === 0) {
        return null;
      }

      // DuckDB returns rows as arrays
      const row = rows[0];
      if (!row) {
        return null;
      }
      const embeddingObj = row[3] as { items?: number[] } | null;

      return {
        id: String(row[0]),
        content: String(row[1]),
        embedding: embeddingObj?.items || [],
        metadata: row[2] ? JSON.parse(String(row[2])) : undefined,
      };
    },

    removeDocument: async (id: string): Promise<void> => {
      await connection.run(
        `DELETE FROM vectors WHERE id = '${id.replace(/'/g, "''")}'`,
      );
    },

    searchSimilar: async (
      embedding: number[],
      options?: SearchOptions,
    ): Promise<VectorSearchResult[]> => {
      const limit = options?.k || 10;
      const dimension = embedding.length;

      // Convert embedding to SQL array literal with proper type casting
      const embeddingStr = `[${embedding
        .map((v) => `${v}::FLOAT`)
        .join(", ")}]::FLOAT[${dimension}]`;

      // Use array_distance for similarity search
      const result = await connection.runAndReadAll(
        `SELECT
           id,
           content,
           metadata,
           embedding,
           array_distance(embedding, ${embeddingStr}) as distance
         FROM vectors
         ORDER BY distance ASC
         LIMIT ${limit}`,
      );

      await result.readAll();
      const rows = result.getRows();

      return rows.map((row) => {
        const embeddingObj = row[3] as { items?: number[] } | null;
        const distance = Number(row[4]);

        return {
          id: String(row[0]),
          content: String(row[1]),
          embedding: embeddingObj?.items || [],
          metadata: row[2] ? JSON.parse(String(row[2])) : undefined,
          score: 1 - distance, // Convert distance to similarity score
        };
      });
    },

    countDocuments: async (
      filter?: Record<string, unknown>,
    ): Promise<number> => {
      let query = "SELECT COUNT(*) as count FROM vectors";

      // Apply filter if provided
      if (filter && Object.keys(filter).length > 0) {
        const conditions: string[] = [];

        for (const [key, value] of Object.entries(filter)) {
          // Handle metadata fields (like sourceType)
          if (typeof value === "string") {
            // Escape single quotes in the value
            const escapedValue = value.replace(/'/g, "''");
            // Use JSON extraction for metadata fields
            // DuckDB uses -> operator for JSON extraction
            conditions.push(`metadata->>'${key}' = '${escapedValue}'`);
          } else if (typeof value === "number") {
            conditions.push(`metadata->>'${key}' = '${value}'`);
          } else if (typeof value === "boolean") {
            conditions.push(`metadata->>'${key}' = '${value}'`);
          }
        }

        if (conditions.length > 0) {
          query += ` WHERE ${conditions.join(" AND ")}`;
        }
      }

      const result = await connection.runAndReadAll(query);
      await result.readAll();
      const rows = result.getRows();

      // DuckDB returns COUNT as BigInt
      const firstRow = rows[0];
      if (!firstRow) {
        return 0;
      }
      const count = firstRow[0];

      return Number(count);
    },

    listDocuments: async (options?: ListOptions): Promise<VectorDocument[]> => {
      const limit = options?.limit || 100;
      const offset = options?.offset || 0;
      const filter = options?.filter;

      let query = `SELECT id, content, metadata, embedding FROM vectors`;

      // Apply filter if provided
      if (filter && Object.keys(filter).length > 0) {
        const conditions: string[] = [];

        for (const [key, value] of Object.entries(filter)) {
          // Handle metadata fields (like sourceType)
          if (typeof value === "string") {
            // Escape single quotes in the value
            const escapedValue = value.replace(/'/g, "''");
            // Use JSON extraction for metadata fields
            // DuckDB uses -> operator for JSON extraction
            conditions.push(`metadata->>'${key}' = '${escapedValue}'`);
          } else if (typeof value === "number") {
            conditions.push(`metadata->>'${key}' = '${value}'`);
          } else if (typeof value === "boolean") {
            conditions.push(`metadata->>'${key}' = '${value}'`);
          }
        }

        if (conditions.length > 0) {
          query += ` WHERE ${conditions.join(" AND ")}`;
        }
      }

      query += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

      const result = await connection.runAndReadAll(query);

      await result.readAll();
      const rows = result.getRows();

      return rows.map((row) => {
        const embeddingObj = row[3] as { items?: number[] } | null;

        return {
          id: String(row[0]),
          content: String(row[1]),
          embedding: embeddingObj?.items || [],
          metadata: row[2] ? JSON.parse(String(row[2])) : undefined,
        };
      });
    },

    // Add cleanup to properly release DuckDB connection
    cleanup: async (): Promise<void> => {
      await releaseInstance(dbPath);
    },
  };

  return { storage };
};

/**
 * Initialize DuckDB with VSS extension for vector operations
 */
const initializeDuckDB = async (
  connection: DuckDBConnection,
  config: DuckDBConfig["options"],
) => {
  // Check if table already exists (using DuckDB's information_schema)
  const tableCheckResult = await connection.runAndReadAll(
    "SELECT table_name FROM information_schema.tables WHERE table_name = 'vectors'",
  );
  await tableCheckResult.readAll();
  const tableExists = tableCheckResult.getRows().length > 0;

  if (tableExists) {
    // Table already exists, skip initialization
    return;
  }

  // Install and load VSS extension if HNSW is enabled
  if (config.enableHNSW === true) {
    try {
      await connection.run("INSTALL vss;");
      await connection.run("LOAD vss;");

      // Enable experimental persistence if requested
      if (config.hnswPersistence) {
        await connection.run(
          "SET hnsw_enable_experimental_persistence = true;",
        );
      }
    } catch (error) {
      console.warn(
        "Failed to load VSS extension. HNSW will be disabled:",
        error,
      );
      // Continue without HNSW - fallback to standard vector operations
    }
  }

  // Create vectors table with DuckDB-specific types
  // Use fixed-size FLOAT array for vector storage
  const dimension = config.dimension;
  await connection.run(`
    CREATE TABLE IF NOT EXISTS vectors (
      id VARCHAR PRIMARY KEY,
      content TEXT NOT NULL,
      metadata TEXT,
      embedding FLOAT[${dimension}] NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Create indexes for better query performance
  await connection.run(`
    CREATE INDEX IF NOT EXISTS idx_vectors_created_at ON vectors(created_at);
  `);

  // Create HNSW index if enabled and VSS is loaded
  if (config.enableHNSW === true) {
    try {
      const metric = config.hnswMetric || "cosine";
      await connection.run(`
        CREATE INDEX IF NOT EXISTS idx_vectors_hnsw
        ON vectors
        USING HNSW (embedding)
        WITH (metric = '${metric}');
      `);
    } catch (error) {
      console.warn("Failed to create HNSW index:", error);
      // Continue without HNSW index
    }
  }
};

/**
 * Create DuckDB adapter for vector database operations
 */
export const createDuckDBAdapter = async (
  config: VectorDBConfig,
): Promise<VectorDBAdapter> => {
  const duckdbConfig = config as DuckDBConfig;
  const dbPath = duckdbConfig.options?.path || ":memory:";

  let baseAdapter: VectorDBAdapter | null = null;
  let storage: StorageOperations | null = null;

  // Initialize function that sets up everything
  const initialize = async (): Promise<void> => {
    if (baseAdapter) return; // Already initialized

    try {
      // Create storage operations
      const result = await createDuckDBStorageOperations(
        dbPath,
        duckdbConfig.options,
      );
      storage = result.storage;

      // Create base adapter
      baseAdapter = createBaseAdapter(
        {
          dimension: duckdbConfig.options.dimension,
          provider: "duckdb",
          version: "1.0.0",
          capabilities: ["vector-search", "hnsw-index", "batch-operations"],
        },
        storage,
      );

      // Initialize the base adapter
      await baseAdapter.initialize();
    } catch (error) {
      console.error("DuckDB initialization error:", error);
      throw new VectorDBError("Failed to initialize DuckDB vector database", {
        cause: error,
      });
    }
  };

  // Close function
  const close = async (): Promise<void> => {
    if (baseAdapter) {
      await baseAdapter.close(); // This will call storage.cleanup()
      baseAdapter = null;
      storage = null;
    }
  };

  // Return adapter with delegated methods
  return {
    initialize,

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

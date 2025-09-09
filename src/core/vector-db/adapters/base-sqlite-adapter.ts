/**
 * Base SQLite adapter factory for vector database operations
 * This factory provides common implementation for both Node.js and Bun SQLite adapters
 */

import { VECTOR_DB_CONSTANTS } from "../constants.js";
import { DocumentNotFoundError, VectorDBError } from "../errors.js";
import { buildSQLWhereClause } from "../utils/filter.js";
import { generateDocumentId, validateDimension } from "../utils/validation.js";
import { createBatchOperations } from "./common-operations.js";
import {
  ensureInitialized as ensureInit,
  rowToSearchResult,
  rowToVectorDocument,
  type SQLiteRowWithSource,
} from "./sqlite-common.js";
import { createSQLiteSchema, SQLiteQueries } from "./sqlite-schema.js";
import type {
  ListOptions,
  SearchOptions,
  VectorDBAdapter,
  VectorDBConfig,
  VectorDocument,
  VectorSearchResult,
} from "./types.js";

/**
 * SQLite database operations interface
 * Abstracts the differences between Node.js and Bun SQLite implementations
 */
export interface SQLiteOperations {
  /**
   * Execute SQL statement without returning results
   */
  exec(sql: string): void;

  /**
   * Prepare a SQL statement
   */
  prepare(sql: string): SQLitePreparedStatement;

  /**
   * Close the database connection
   */
  close(): void;

  /**
   * Check if database is open
   */
  isOpen(): boolean;
}

/**
 * Prepared statement interface
 */
export interface SQLitePreparedStatement {
  /**
   * Run the statement with parameters and return last insert info
   */
  run(...params: unknown[]): { lastInsertRowid: number | bigint } | undefined;

  /**
   * Get a single row
   */
  get(...params: unknown[]): unknown;

  /**
   * Get all rows
   */
  all(...params: unknown[]): unknown[];
}

/**
 * Configuration for the base SQLite adapter
 */
export interface BaseSQLiteConfig {
  /**
   * Database configuration
   */
  config: VectorDBConfig;

  /**
   * Initialize the database connection and return operations
   */
  initializeConnection: () => Promise<SQLiteOperations>;

  /**
   * Function to convert embedding for insertion (e.g., vec_f32 for Bun)
   */
  prepareEmbeddingForInsert?: (embedding: Float32Array) => Float32Array;

  /**
   * Custom SQL for vector insertion (if different from standard)
   */
  vectorInsertSQL?: string;

  /**
   * Custom SQL for vector update (if different from standard)
   */
  vectorUpdateSQL?: string;

  /**
   * Custom SQL for vector search (if different from standard)
   */
  vectorSearchSQL?: string;

  /**
   * Provider name for getInfo
   */
  providerName: string;
}

/**
 * Creates a base SQLite adapter with common implementation
 */
export const createSQLiteAdapterBase = ({
  config,
  initializeConnection,
  prepareEmbeddingForInsert = (e) => e,
  vectorInsertSQL,
  vectorUpdateSQL,
  vectorSearchSQL,
  providerName,
}: BaseSQLiteConfig): VectorDBAdapter => {
  // Private state
  let db: SQLiteOperations | null = null;
  const dimension =
    config.options?.dimension ?? VECTOR_DB_CONSTANTS.DEFAULT_DIMENSION;
  let initialized = false;
  const batchOps = createBatchOperations();

  // Helper function to ensure database is initialized
  const ensureInitialized = (): void => {
    ensureInit(db, initialized);
  };

  // Initialize the database
  const initialize = async (): Promise<void> => {
    if (initialized) return;

    try {
      // Initialize connection using the provided function
      db = await initializeConnection();

      // Create tables with vector support
      db.exec(createSQLiteSchema(Number(dimension)));

      initialized = true;
    } catch (error) {
      console.error(`${providerName} initialization error:`, error);
      throw new VectorDBError(
        `Failed to initialize ${providerName} vector database`,
        { cause: error },
      );
    }
  };

  // Insert a document
  const insert = async (document: VectorDocument): Promise<string> => {
    ensureInitialized();

    const id = generateDocumentId(document.id);
    validateDimension(document.embedding, Number(dimension));

    // Check for sourceId and originalContent in metadata
    const sourceId = document.metadata?.sourceId;
    let sourceIdToUse: string | null = null;

    if (sourceId) {
      // Check if source already exists
      const existingSource = db
        ?.prepare(SQLiteQueries.SELECT_SOURCE)
        .get(sourceId) as { source_id: string } | undefined;

      if (!existingSource) {
        // Extract source-related metadata for first chunk
        const chunkIndex = document.metadata?.chunkIndex;
        if (chunkIndex === 0 || chunkIndex === undefined) {
          const originalContent = document.metadata?.originalContent;
          if (originalContent) {
            // Insert into sources table
            const title = document.metadata?.title || null;
            const url = document.metadata?.url || null;
            const sourceType = document.metadata?.sourceType || null;

            db?.prepare(SQLiteQueries.INSERT_SOURCE).run(
              sourceId,
              originalContent,
              title,
              url,
              sourceType,
            );
          }
        }
      }
      sourceIdToUse = String(sourceId);
    }

    // Convert embedding array to Float32Array for sqlite-vec
    const embeddingFloat32 = new Float32Array(document.embedding);
    const preparedEmbedding = prepareEmbeddingForInsert(embeddingFloat32);

    // Insert vector into vec_documents table
    const insertSQL = vectorInsertSQL || SQLiteQueries.INSERT_VECTOR;
    const vecInsertStmt = db?.prepare(insertSQL);
    const vecResult = vecInsertStmt?.run(preparedEmbedding) as
      | { lastInsertRowid: number | bigint }
      | undefined;
    const vecRowId = vecResult?.lastInsertRowid;

    // Prepare metadata without originalContent (as it's stored in sources table)
    const metadata = document.metadata ? { ...document.metadata } : {};
    if ("originalContent" in metadata) {
      delete metadata.originalContent;
    }

    // Insert document with foreign key reference to vector
    const docInsertStmt = db?.prepare(SQLiteQueries.INSERT_DOCUMENT);
    docInsertStmt?.run(
      id,
      sourceIdToUse,
      document.content,
      Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
      vecRowId,
    );

    return id;
  };

  // Get a document by ID
  const get = async (id: string): Promise<VectorDocument | null> => {
    ensureInitialized();

    const result = db
      ?.prepare(SQLiteQueries.SELECT_DOCUMENT_WITH_SOURCE)
      .get(id) as SQLiteRowWithSource | undefined;

    if (!result) return null;

    return rowToVectorDocument(result);
  };

  // Update a document
  const update = async (
    id: string,
    updates: Partial<VectorDocument>,
  ): Promise<void> => {
    ensureInitialized();

    if (!id) {
      throw new VectorDBError("Document ID is required for update");
    }

    if (updates.embedding) {
      validateDimension(updates.embedding, Number(dimension));
    }

    // Get the vec_rowid for the document
    const existingDoc = db
      ?.prepare(SQLiteQueries.SELECT_DOCUMENT_VEC_ROWID)
      .get(id) as { vec_rowid: number } | undefined;

    if (!existingDoc) {
      throw new DocumentNotFoundError(id);
    }

    // Update vector if provided
    if (updates.embedding) {
      const embeddingFloat32 = new Float32Array(updates.embedding);
      const preparedEmbedding = prepareEmbeddingForInsert(embeddingFloat32);
      const updateSQL = vectorUpdateSQL || SQLiteQueries.UPDATE_VECTOR;
      const vecUpdateStmt = db?.prepare(updateSQL);
      vecUpdateStmt?.run(preparedEmbedding, existingDoc.vec_rowid);
    }

    // Prepare metadata without originalContent
    const metadata = updates.metadata ? { ...updates.metadata } : undefined;
    if (metadata && "originalContent" in metadata) {
      delete metadata.originalContent;
    }

    // Build update query dynamically based on what's being updated
    const updateFields: string[] = [];
    const updateValues: unknown[] = [];

    if (updates.content !== undefined) {
      updateFields.push("content = ?");
      updateValues.push(updates.content);
    }

    if (metadata !== undefined) {
      updateFields.push("metadata = ?");
      updateValues.push(JSON.stringify(metadata));
    }

    if (updateFields.length > 0) {
      updateValues.push(id);
      const docUpdateStmt = db?.prepare(
        `UPDATE documents SET ${updateFields.join(", ")} WHERE id = ?`,
      );
      docUpdateStmt?.run(...updateValues);
    }
  };

  // Delete a document
  const deleteDoc = async (id: string): Promise<void> => {
    ensureInitialized();

    // Get the vec_rowid and source_id before deletion
    const doc = db
      ?.prepare(SQLiteQueries.DELETE_DOCUMENT_VEC_ROWID_SOURCE)
      .get(id) as { vec_rowid: number; source_id: string | null } | undefined;

    if (!doc) {
      throw new DocumentNotFoundError(id);
    }

    // Delete from documents table
    const deleteDocStmt = db?.prepare(SQLiteQueries.DELETE_DOCUMENT);
    deleteDocStmt?.run(id);

    // Delete from vec_documents table
    const deleteVecStmt = db?.prepare(SQLiteQueries.DELETE_VECTOR);
    deleteVecStmt?.run(doc.vec_rowid);

    // Check if this was the last document for the source
    if (doc.source_id) {
      const remainingDocs = db
        ?.prepare(SQLiteQueries.COUNT_DOCUMENTS_BY_SOURCE)
        .get(doc.source_id) as { count: number };

      if (remainingDocs.count === 0) {
        // Delete the source if no more documents reference it
        const deleteSourceStmt = db?.prepare(SQLiteQueries.DELETE_SOURCE);
        deleteSourceStmt?.run(doc.source_id);
      }
    }
  };

  // Search for similar documents
  const search = async (
    embedding: number[],
    options: SearchOptions = {},
  ): Promise<VectorSearchResult[]> => {
    ensureInitialized();

    validateDimension(embedding, Number(dimension));

    const k = options.k ?? VECTOR_DB_CONSTANTS.DEFAULT_SEARCH_K;
    const { whereClause, params } = buildSQLWhereClause(options.filter);

    // Build the base query for vector search
    const baseQuery = SQLiteQueries.VECTOR_SEARCH_BASE;

    // Build WHERE clause with vector search condition
    const matchSQL = vectorSearchSQL || "?";
    const vectorCondition = `v.rowid IN (
        SELECT rowid FROM vec_documents
        WHERE embedding MATCH ${matchSQL}
        ORDER BY distance
        LIMIT ?
      )`;

    const query = whereClause
      ? `${baseQuery} WHERE ${whereClause} AND ${vectorCondition} ORDER BY v.distance LIMIT ?`
      : `${baseQuery} WHERE ${vectorCondition} ORDER BY v.distance LIMIT ?`;

    // Execute the query
    const stmt = db?.prepare(query);
    const embeddingFloat32 = new Float32Array(embedding);
    const preparedEmbedding = prepareEmbeddingForInsert(embeddingFloat32);
    const results = stmt?.all(...params, preparedEmbedding, k, k) as
      | SQLiteRowWithSource[]
      | undefined;

    if (!results) return [];

    return results.map(rowToSearchResult);
  };

  // List documents
  const list = async (options: ListOptions = {}): Promise<VectorDocument[]> => {
    ensureInitialized();

    const limit = options.limit ?? VECTOR_DB_CONSTANTS.DEFAULT_LIST_LIMIT;
    const offset = options.offset ?? 0;
    const { whereClause, params } = buildSQLWhereClause(options.filter);

    const baseQuery = SQLiteQueries.LIST_DOCUMENTS_BASE;

    const query = whereClause
      ? `${baseQuery} WHERE ${whereClause} ORDER BY d.created_at DESC LIMIT ? OFFSET ?`
      : `${baseQuery} ORDER BY d.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const stmt = db?.prepare(query);
    const results = stmt?.all(...params) as SQLiteRowWithSource[] | undefined;

    if (!results) return [];

    return results.map(rowToVectorDocument);
  };

  // Count documents
  const count = async (filter?: Record<string, unknown>): Promise<number> => {
    ensureInitialized();

    const { whereClause, params } = buildSQLWhereClause(filter);

    const query = whereClause
      ? `SELECT COUNT(*) as count FROM documents WHERE ${whereClause}`
      : "SELECT COUNT(*) as count FROM documents";

    const result = db?.prepare(query).get(...params) as { count: number };
    return result?.count ?? 0;
  };

  // Close the database connection
  const close = async (): Promise<void> => {
    if (db?.isOpen()) {
      db.close();
      db = null;
      initialized = false;
    }
  };

  // Get database information
  const getInfo = () => {
    return {
      provider: providerName,
      version: "1.0.0",
      capabilities: ["vector-search", "metadata-filter", "batch-operations"],
    };
  };

  // Return the adapter interface with batch operations
  return {
    initialize,
    insert,
    get,
    update,
    delete: deleteDoc,
    search,
    list,
    count,
    close,
    getInfo,
    insertBatch: (documents: VectorDocument[]) =>
      batchOps.insertBatch(documents, insert),
    deleteBatch: (ids: string[]) => batchOps.deleteBatch(ids, deleteDoc),
  };
};

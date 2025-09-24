/**
 * SQLite-specific storage operations implementation
 * Implements the StorageOperations interface for SQLite-based adapters
 */

import { VECTOR_DB_CONSTANTS } from "../constants.js";
import { DocumentNotFoundError } from "../errors.js";
import { buildSQLWhereClause } from "../utils/filter.js";
import { generateDocumentId, validateDimension } from "../utils/validation.js";
import type { StorageOperations } from "./base-adapter.js";
import {
  rowToSearchResult,
  rowToVectorDocument,
  type SQLiteRowWithSource,
} from "./sqlite-common.js";
import { SQLiteQueries } from "./sqlite-schema.js";
import type {
  ListOptions,
  SearchOptions,
  VectorDocument,
  VectorSearchResult,
} from "./types.js";

/**
 * SQLite database operations interface
 */
export interface SQLiteOperations {
  prepare: (sql: string) => {
    run: (...params: unknown[]) => { lastInsertRowid: number | bigint };
    get: (...params: unknown[]) => unknown;
    all: (...params: unknown[]) => unknown[];
  };
  exec?: (sql: string) => void;
  isOpen: () => boolean;
  close: () => void;
}

/**
 * Creates SQLite-specific storage operations
 * @param db - SQLite database connection
 * @param dimension - Vector dimension
 * @param prepareEmbeddingForInsert - Optional function to prepare embedding for insertion
 * @param vectorInsertSQL - Optional custom SQL for vector insertion (e.g., for Bun)
 * @param vectorUpdateSQL - Optional custom SQL for vector update (e.g., for Bun)
 * @param vectorSearchSQL - Optional custom SQL for vector search (e.g., for Bun)
 * @returns Storage operations implementation
 */
export const createSQLiteStorageOperations = (
  db: SQLiteOperations,
  dimension: number,
  prepareEmbeddingForInsert: (embedding: Float32Array) => Float32Array = (e) =>
    e,
  vectorInsertSQL?: string,
  _vectorUpdateSQL?: string,
  vectorSearchSQL?: string,
): StorageOperations => {
  /**
   * Store a document in the database
   */
  const storeDocument = async (doc: VectorDocument): Promise<string> => {
    const id = generateDocumentId(doc.id);
    validateDimension(doc.embedding, dimension);

    // Check for sourceId and originalContent in metadata
    const sourceId = doc.metadata?.sourceId;
    let sourceIdToUse: string | null = null;

    if (sourceId) {
      // Check if source already exists
      const existingSource = db
        .prepare(SQLiteQueries.SELECT_SOURCE)
        .get(sourceId) as { source_id: string } | undefined;

      if (!existingSource) {
        // Extract source-related metadata for first chunk
        const chunkIndex = doc.metadata?.chunkIndex;
        if (chunkIndex === 0 || chunkIndex === undefined) {
          const originalContent = doc.metadata?.originalContent;
          if (originalContent) {
            // Insert into sources table
            const title = doc.metadata?.title || null;
            const url = doc.metadata?.url || null;
            const sourceType = doc.metadata?.sourceType || null;

            db.prepare(SQLiteQueries.INSERT_SOURCE).run(
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
    const embeddingFloat32 = new Float32Array(doc.embedding);
    const preparedEmbedding = prepareEmbeddingForInsert(embeddingFloat32);

    // Insert vector into vec_documents table
    const insertSQL = vectorInsertSQL || SQLiteQueries.INSERT_VECTOR;
    const vecInsertStmt = db.prepare(insertSQL);
    const vecResult = vecInsertStmt.run(preparedEmbedding) as {
      lastInsertRowid: number | bigint;
    };
    const vecRowId = vecResult.lastInsertRowid;

    // Prepare metadata without originalContent (as it's stored in sources table)
    const metadata = doc.metadata ? { ...doc.metadata } : {};
    if ("originalContent" in metadata) {
      delete metadata.originalContent;
    }

    // Insert document with foreign key reference to vector
    const docInsertStmt = db.prepare(SQLiteQueries.INSERT_DOCUMENT);
    docInsertStmt.run(
      id,
      sourceIdToUse,
      doc.content,
      Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
      vecRowId,
    );

    return id;
  };

  /**
   * Retrieve a document by ID
   */
  const retrieveDocument = async (
    id: string,
  ): Promise<VectorDocument | null> => {
    const result = db
      .prepare(SQLiteQueries.SELECT_DOCUMENT_WITH_SOURCE)
      .get(id) as SQLiteRowWithSource | undefined;

    if (!result) return null;

    return rowToVectorDocument(result);
  };

  /**
   * Remove a document from the database
   */
  const removeDocument = async (id: string): Promise<void> => {
    // Get the vec_rowid and source_id before deletion
    const doc = db
      .prepare(SQLiteQueries.DELETE_DOCUMENT_VEC_ROWID_SOURCE)
      .get(id) as { vec_rowid: number; source_id: string | null } | undefined;

    if (!doc) {
      throw new DocumentNotFoundError(id);
    }

    // Delete from documents table
    const deleteDocStmt = db.prepare(SQLiteQueries.DELETE_DOCUMENT);
    deleteDocStmt.run(id);

    // Delete from vec_documents table
    const deleteVecStmt = db.prepare(SQLiteQueries.DELETE_VECTOR);
    deleteVecStmt.run(doc.vec_rowid);

    // Check if this was the last document for the source
    if (doc.source_id) {
      const remainingDocs = db
        .prepare(SQLiteQueries.COUNT_DOCUMENTS_BY_SOURCE)
        .get(doc.source_id) as { count: number };

      if (remainingDocs.count === 0) {
        // Delete the source if no more documents reference it
        const deleteSourceStmt = db.prepare(SQLiteQueries.DELETE_SOURCE);
        deleteSourceStmt.run(doc.source_id);
      }
    }
  };

  /**
   * Search for similar documents
   */
  const searchSimilar = async (
    embedding: number[],
    options: SearchOptions = {},
  ): Promise<VectorSearchResult[]> => {
    validateDimension(embedding, dimension);

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
    const stmt = db.prepare(query);
    const embeddingFloat32 = new Float32Array(embedding);
    const preparedEmbedding = prepareEmbeddingForInsert(embeddingFloat32);
    const results = stmt.all(...params, preparedEmbedding, k, k) as
      | SQLiteRowWithSource[]
      | undefined;

    if (!results) return [];

    return results.map(rowToSearchResult);
  };

  /**
   * Count documents with optional filter
   */
  const countDocuments = async (
    filter?: Record<string, unknown>,
  ): Promise<number> => {
    const { whereClause, params } = buildSQLWhereClause(filter);

    const query = whereClause
      ? `SELECT COUNT(*) as count FROM documents WHERE ${whereClause}`
      : "SELECT COUNT(*) as count FROM documents";

    const result = db.prepare(query).get(...params) as { count: number };
    return result?.count ?? 0;
  };

  /**
   * List documents with pagination and filtering
   */
  const listDocuments = async (
    options: ListOptions = {},
  ): Promise<VectorDocument[]> => {
    const limit = options.limit ?? VECTOR_DB_CONSTANTS.DEFAULT_LIST_LIMIT;
    const offset = options.offset ?? 0;
    const { whereClause, params } = buildSQLWhereClause(options.filter);

    const baseQuery = SQLiteQueries.LIST_DOCUMENTS_BASE;

    const query = whereClause
      ? `${baseQuery} WHERE ${whereClause} ORDER BY d.created_at DESC LIMIT ? OFFSET ?`
      : `${baseQuery} ORDER BY d.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const stmt = db.prepare(query);
    const results = stmt.all(...params) as SQLiteRowWithSource[] | undefined;

    if (!results) return [];

    return results.map(rowToVectorDocument);
  };

  return {
    storeDocument,
    retrieveDocument,
    removeDocument,
    searchSimilar,
    countDocuments,
    listDocuments,
    // Note: No clear() method - data deletion should be explicit via removeDocument
    // cleanup is not needed here as DB connection is managed by the adapter
  };
};

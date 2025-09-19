/**
 * SQLite schema definitions shared between SQLite adapters
 * This module contains all SQL DDL statements for creating tables, indexes, and triggers
 */

import type { Buffer } from "node:buffer";

/**
 * Creates the SQL schema for the vector database
 * @param dimension - The dimension of the vector embeddings
 * @returns The complete SQL schema as a string
 */
export const createSQLiteSchema = (dimension: number): string => {
  return `
    CREATE TABLE IF NOT EXISTS sources (
      source_id TEXT PRIMARY KEY,
      original_content TEXT NOT NULL,
      title TEXT,
      url TEXT,
      source_type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      source_id TEXT,
      content TEXT NOT NULL,
      metadata TEXT,
      vec_rowid INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (source_id) REFERENCES sources(source_id) ON DELETE CASCADE
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS vec_documents 
    USING vec0(embedding float[${dimension}]);

    CREATE INDEX IF NOT EXISTS idx_sources_source_type 
    ON sources(source_type);

    CREATE INDEX IF NOT EXISTS idx_documents_source_id 
    ON documents(source_id);

    CREATE INDEX IF NOT EXISTS idx_documents_created_at 
    ON documents(created_at);
    
    CREATE INDEX IF NOT EXISTS idx_documents_vec_rowid
    ON documents(vec_rowid);

    CREATE TRIGGER IF NOT EXISTS update_timestamp
    AFTER UPDATE ON documents
    BEGIN
      UPDATE documents SET updated_at = CURRENT_TIMESTAMP
      WHERE id = NEW.id;
    END;

    CREATE TABLE IF NOT EXISTS source_extensions (
      source_id TEXT,
      extension TEXT,
      file_count INTEGER DEFAULT 1,
      total_size INTEGER,
      PRIMARY KEY (source_id, extension),
      FOREIGN KEY (source_id) REFERENCES sources(source_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_source_extensions_extension
    ON source_extensions(extension);

    CREATE TABLE IF NOT EXISTS extension_stats (
      extension TEXT PRIMARY KEY,
      total_sources INTEGER DEFAULT 0,
      total_files INTEGER DEFAULT 0,
      total_chunks INTEGER DEFAULT 0,
      language TEXT,
      category TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `;
};

/**
 * SQL queries used across SQLite adapters
 */
export const SQLiteQueries = {
  // Source queries
  SELECT_SOURCE: "SELECT source_id FROM sources WHERE source_id = ?",
  INSERT_SOURCE:
    "INSERT INTO sources (source_id, original_content, title, url, source_type) VALUES (?, ?, ?, ?, ?)",
  DELETE_SOURCE: "DELETE FROM sources WHERE source_id = ?",

  // Document queries
  SELECT_DOCUMENT_VEC_ROWID: "SELECT vec_rowid FROM documents WHERE id = ?",
  SELECT_DOCUMENT_WITH_SOURCE: `
    SELECT d.id, d.source_id, d.content, d.metadata, v.embedding, 
           s.original_content, s.title, s.url, s.source_type
    FROM documents d
    JOIN vec_documents v ON d.vec_rowid = v.rowid
    LEFT JOIN sources s ON d.source_id = s.source_id
    WHERE d.id = ?
  `,
  INSERT_DOCUMENT: `INSERT INTO documents (id, source_id, content, metadata, vec_rowid) 
                    VALUES (?, ?, ?, ?, ?)`,
  DELETE_DOCUMENT: "DELETE FROM documents WHERE id = ?",
  DELETE_DOCUMENT_VEC_ROWID_SOURCE:
    "SELECT vec_rowid, source_id FROM documents WHERE id = ?",
  COUNT_DOCUMENTS_BY_SOURCE:
    "SELECT COUNT(*) as count FROM documents WHERE source_id = ?",

  // Vector queries (these need to be adapted per implementation)
  INSERT_VECTOR: "INSERT INTO vec_documents(embedding) VALUES (?)",
  INSERT_VECTOR_BUN: "INSERT INTO vec_documents(embedding) VALUES (vec_f32(?))",
  UPDATE_VECTOR: "UPDATE vec_documents SET embedding = ? WHERE rowid = ?",
  UPDATE_VECTOR_BUN:
    "UPDATE vec_documents SET embedding = vec_f32(?) WHERE rowid = ?",
  DELETE_VECTOR: "DELETE FROM vec_documents WHERE rowid = ?",

  // Search queries
  VECTOR_SEARCH_BASE: `
    SELECT 
      d.id,
      d.source_id,
      d.content,
      d.metadata,
      v.distance,
      v.embedding,
      s.original_content,
      s.title,
      s.url,
      s.source_type
    FROM vec_documents v
    JOIN documents d ON d.vec_rowid = v.rowid
    LEFT JOIN sources s ON d.source_id = s.source_id
  `,

  // List queries
  LIST_DOCUMENTS_BASE: `
    SELECT d.id, d.source_id, d.content, d.metadata, v.embedding,
           s.original_content, s.title, s.url, s.source_type
    FROM documents d
    JOIN vec_documents v ON d.vec_rowid = v.rowid
    LEFT JOIN sources s ON d.source_id = s.source_id
  `,

  // Extension queries
  INSERT_SOURCE_EXTENSION: `
    INSERT INTO source_extensions (source_id, extension, file_count, total_size)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(source_id, extension) DO UPDATE SET
      file_count = file_count + excluded.file_count,
      total_size = COALESCE(total_size, 0) + COALESCE(excluded.total_size, 0)
  `,
  UPDATE_EXTENSION_STATS: `
    INSERT INTO extension_stats (extension, total_sources, total_files, total_chunks, language, category)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(extension) DO UPDATE SET
      total_sources = excluded.total_sources,
      total_files = excluded.total_files,
      total_chunks = excluded.total_chunks,
      language = excluded.language,
      category = excluded.category,
      updated_at = CURRENT_TIMESTAMP
  `,
  SELECT_EXTENSION_STATS: `
    SELECT extension, total_sources, total_files, total_chunks, language, category
    FROM extension_stats
    ORDER BY total_chunks DESC
  `,
  SELECT_SOURCE_EXTENSIONS: `
    SELECT se.extension, se.file_count, se.total_size, es.language, es.category
    FROM source_extensions se
    LEFT JOIN extension_stats es ON se.extension = es.extension
    WHERE se.source_id = ?
  `,
  SELECT_SOURCES_WITH_EXTENSION_SUMMARY: `
    SELECT
      s.source_id,
      s.title,
      s.url,
      s.source_type,
      s.created_at,
      COUNT(DISTINCT se.extension) as extension_count,
      SUM(se.file_count) as total_files,
      GROUP_CONCAT(se.extension || ':' || se.file_count) as extensions_detail
    FROM sources s
    LEFT JOIN source_extensions se ON s.source_id = se.source_id
    GROUP BY s.source_id
    ORDER BY s.created_at DESC
  `,
} as const;

/**
 * SQL input value type for prepared statements
 */
export type SQLInputValue =
  | string
  | number
  | boolean
  | null
  | Uint8Array
  | Float32Array
  | Buffer;

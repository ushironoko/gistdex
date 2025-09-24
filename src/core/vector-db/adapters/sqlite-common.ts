/**
 * Common utilities for SQLite-based adapters
 * Shared between sqlite-adapter.ts and bun-sqlite-adapter.ts
 */

import { Buffer } from "node:buffer";

/**
 * Type guard to check if value is a Buffer
 */
const isBuffer = (value: unknown): value is Buffer => {
  return Buffer.isBuffer(value);
};

/**
 * Type guard to check if value is a Uint8Array
 */
const isUint8Array = (value: unknown): value is Uint8Array => {
  return value instanceof Uint8Array;
};

/**
 * Helper function to parse metadata JSON safely
 * @param metadataJson - JSON string or null
 * @returns Parsed metadata object or undefined
 */
export const parseMetadata = (
  metadataJson: string | null,
): Record<string, unknown> | undefined => {
  if (!metadataJson) return undefined;
  try {
    return JSON.parse(metadataJson);
  } catch {
    return undefined;
  }
};

/**
 * Enriches metadata with source-related information
 * @param metadata - Base metadata object
 * @param sourceData - Source data from database
 * @returns Enriched metadata object
 */
export const enrichMetadataWithSource = (
  metadata: Record<string, unknown> | undefined,
  sourceData: {
    source_id: string | null;
    original_content?: string | null;
    title?: string | null;
    url?: string | null;
    source_type?: string | null;
  },
): Record<string, unknown> | undefined => {
  if (!sourceData.source_id) return metadata;

  const enrichedMetadata: Record<string, unknown> = {
    ...metadata,
    sourceId: sourceData.source_id,
  };

  // Add originalContent only for first chunk (chunkIndex = 0)
  if (metadata?.chunkIndex === 0 && sourceData.original_content) {
    enrichedMetadata.originalContent = sourceData.original_content;
  }

  if (sourceData.title) {
    enrichedMetadata.title = sourceData.title;
  }
  if (sourceData.url) {
    enrichedMetadata.url = sourceData.url;
  }
  if (sourceData.source_type) {
    enrichedMetadata.sourceType = sourceData.source_type;
  }

  return enrichedMetadata;
};

/**
 * Type definition for SQLite row result with source data
 */
export interface SQLiteRowWithSource {
  id: string;
  source_id: string | null;
  content: string;
  metadata: string | null;
  embedding: Buffer | Uint8Array;
  original_content: string | null;
  title: string | null;
  url: string | null;
  source_type: string | null;
  distance?: number;
}

/**
 * Converts a SQLite row to a VectorDocument format
 * @param row - Row from SQLite database
 * @returns VectorDocument object
 */
export const rowToVectorDocument = (row: SQLiteRowWithSource) => {
  const metadata = parseMetadata(row.metadata);
  const enrichedMetadata = enrichMetadataWithSource(metadata, row);

  // Convert Buffer/Uint8Array to number array
  let embeddingArray: number[];
  const embedding = row.embedding;

  if (isUint8Array(embedding) && !isBuffer(embedding)) {
    // Pure Uint8Array (not Buffer)
    embeddingArray = Array.from(new Float32Array(embedding.buffer));
  } else if (isBuffer(embedding)) {
    // Buffer (which is also a Uint8Array)
    embeddingArray = Array.from(
      new Float32Array(
        embedding.buffer,
        embedding.byteOffset,
        embedding.length / 4,
      ),
    );
  } else {
    // Fallback for unexpected types
    embeddingArray = [];
  }

  return {
    id: row.id,
    content: row.content,
    embedding: embeddingArray,
    metadata: enrichedMetadata,
  };
};

/**
 * Converts a SQLite row to a VectorSearchResult format
 * @param row - Row from SQLite database with distance
 * @returns VectorSearchResult object
 */
export const rowToSearchResult = (row: SQLiteRowWithSource) => {
  const document = rowToVectorDocument(row);
  return {
    ...document,
    score: row.distance !== undefined ? 1 - row.distance : 0,
  };
};

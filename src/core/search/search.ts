import type { DatabaseService } from "../database/database-service.js";
import { generateEmbedding } from "../embedding/embedding.js";
import { sortByScore } from "../utils/ranking.js";
import type { VectorSearchResult } from "../vector-db/adapters/types.js";

export interface RerankOptions {
  boostFactor?: number;
}

/**
 * Extract and normalize query words for text matching
 * Shared utility to eliminate duplicate query processing logic
 */
function extractQueryWords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

export function rerankResults<T extends { content: string; score: number }>(
  query: string,
  results: T[],
  options: RerankOptions = {},
): T[] {
  const { boostFactor = 0.1 } = options;

  const queryWords = extractQueryWords(query);

  if (queryWords.length === 0) {
    return results;
  }

  const boostedResults = results.map((result) => {
    const contentLower = result.content.toLowerCase();
    const matchCount = queryWords.filter((word) =>
      contentLower.includes(word),
    ).length;

    const boostedScore = result.score + matchCount * boostFactor;

    return {
      ...result,
      score: boostedScore,
    };
  });

  return sortByScore(boostedResults);
}

export interface SemanticSearchOptions {
  k?: number;
  sourceType?: string;
  rerank?: boolean;
  rerankBoostFactor?: number;
}

export async function semanticSearch(
  query: string,
  options: SemanticSearchOptions = {},
  service?: DatabaseService,
): Promise<VectorSearchResult[]> {
  const { k = 5, sourceType, rerank = true, rerankBoostFactor = 0.1 } = options;

  try {
    const queryEmbedding = await generateEmbedding(query);

    // Use provided service or fall back to singleton (for backward compatibility)
    const dbService = service;
    if (!dbService) {
      throw new Error("Database service is required");
    }

    const results = await dbService.searchItems({
      embedding: queryEmbedding,
      k,
      sourceType,
    });

    if (rerank) {
      return rerankResults(query, results, {
        boostFactor: rerankBoostFactor,
      });
    }

    return results;
  } catch (error) {
    throw new Error("Failed to perform semantic search", {
      cause: error,
    });
  }
}

export interface HybridSearchOptions extends SemanticSearchOptions {
  keywordWeight?: number;
}

export async function hybridSearch(
  query: string,
  options: HybridSearchOptions = {},
  service?: DatabaseService,
): Promise<VectorSearchResult[]> {
  const { keywordWeight = 0.3, ...semanticOptions } = options;

  const semanticResults = await semanticSearch(
    query,
    {
      ...semanticOptions,
      rerank: false,
    },
    service,
  );

  const queryWords = extractQueryWords(query);

  const hybridResults = semanticResults.map((result) => {
    const contentLower = result.content.toLowerCase();

    const exactMatchCount = queryWords.filter((word) =>
      contentLower.includes(word),
    ).length;

    const wordMatchScore =
      queryWords.length > 0 ? exactMatchCount / queryWords.length : 0;

    const hybridScore =
      result.score * (1 - keywordWeight) + wordMatchScore * keywordWeight;

    return {
      ...result,
      score: hybridScore,
    };
  });

  return sortByScore(hybridResults);
}

export interface SearchStats {
  totalResults: number;
  averageScore: number;
  maxScore: number;
  minScore: number;
  sourceTypes: Record<string, number>;
}

/**
 * Retrieves the full original content from a search result by finding
 * the first chunk with the same sourceId
 */
export async function getOriginalContent(
  result: VectorSearchResult,
  service: DatabaseService,
): Promise<string | null> {
  const sourceId = result.metadata?.sourceId;

  if (!sourceId) {
    // Fallback to the chunk content if no sourceId
    return result.content;
  }

  try {
    // First, try to get the first chunk with chunkIndex: 0
    // The SQLite adapter now includes originalContent from sources table
    const allDocs = await service.listItems({
      limit: 1,
      filter: { sourceId, chunkIndex: 0 },
    });

    if (allDocs.length > 0) {
      const firstChunk = allDocs[0];
      // Check if originalContent is available (from sources table via adapter)
      if (firstChunk?.metadata?.originalContent) {
        return firstChunk.metadata.originalContent;
      }
    }

    // Fallback: Get all chunks with the same sourceId
    const allChunks = await service.listItems({
      limit: 1000, // Large limit to get all chunks
      filter: { sourceId },
    });

    // Find the chunk with chunkIndex: 0 which might contain originalContent
    const firstChunk = allChunks.find(
      (doc) => doc.metadata?.chunkIndex === 0 && doc.metadata?.originalContent,
    );

    if (firstChunk?.metadata?.originalContent) {
      return firstChunk.metadata.originalContent;
    }

    // If no original content found, try to reconstruct from all chunks
    const sortedChunks = allChunks
      .filter((doc) => doc.metadata?.sourceId === sourceId)
      .sort((a, b) => {
        const indexA = a.metadata?.chunkIndex ?? 0;
        const indexB = b.metadata?.chunkIndex ?? 0;
        return indexA - indexB;
      });

    if (sortedChunks.length > 0) {
      // Reconstruct content from chunks (considering overlap)
      const chunkOverlap = 200; // Default overlap
      const firstChunk = sortedChunks[0];
      if (!firstChunk) {
        return result.content;
      }
      let reconstructed = firstChunk.content;

      for (let i = 1; i < sortedChunks.length; i++) {
        const currentChunk = sortedChunks[i];
        if (!currentChunk) continue;
        const chunk = currentChunk.content;
        // Try to remove overlap by finding common substring
        const overlapStart = Math.max(0, reconstructed.length - chunkOverlap);
        const overlapText = reconstructed.substring(overlapStart);
        const overlapIndex = chunk.indexOf(overlapText);

        if (overlapIndex === 0) {
          // Found overlap, append only the new part
          reconstructed += chunk.substring(overlapText.length);
        } else {
          // No clear overlap found, just append with a newline
          reconstructed += `\n${chunk}`;
        }
      }

      return reconstructed;
    }
  } catch (error) {
    console.error("Error retrieving original content:", error);
  }

  return result.content;
}

/**
 * Get the full content of a section for markdown files with boundary information
 */
export async function getSectionContent(
  result: VectorSearchResult,
  service: DatabaseService,
): Promise<string | null> {
  const sourceId = result.metadata?.sourceId;
  const boundary = result.metadata?.boundary as
    | {
        type?: string;
        level?: number;
        title?: string;
        name?: string;
      }
    | undefined;

  if (!sourceId || !boundary) {
    // No section information available, fallback to chunk content
    return result.content;
  }

  try {
    // Get all chunks from the same section
    const allChunks = await service.listItems({
      limit: 1000,
      filter: {
        sourceId,
        ...(boundary.type ? { "boundary.type": boundary.type } : {}),
        ...(boundary.title ? { "boundary.title": boundary.title } : {}),
        ...(boundary.level !== undefined
          ? { "boundary.level": boundary.level }
          : {}),
      },
    });

    if (allChunks.length === 0) {
      return result.content;
    }

    // Sort chunks by their index
    const sortedChunks = allChunks.sort((a, b) => {
      const indexA = a.metadata?.chunkIndex ?? 0;
      const indexB = b.metadata?.chunkIndex ?? 0;
      return indexA - indexB;
    });

    // Reconstruct section content from chunks
    if (sortedChunks.length === 1) {
      return sortedChunks[0]?.content || result.content;
    }

    // Handle multiple chunks in the same section
    const chunkOverlap = 200; // Default overlap
    let reconstructed = sortedChunks[0]?.content || "";

    for (let i = 1; i < sortedChunks.length; i++) {
      const currentChunk = sortedChunks[i];
      if (!currentChunk) continue;
      const chunk = currentChunk.content;

      // Try to remove overlap by finding common substring
      const overlapStart = Math.max(0, reconstructed.length - chunkOverlap);
      const overlapText = reconstructed.substring(overlapStart);
      const overlapIndex = chunk.indexOf(overlapText);

      if (overlapIndex === 0) {
        // Found overlap, append only the new part
        reconstructed += chunk.substring(overlapText.length);
      } else {
        // No clear overlap found, just append with a newline
        reconstructed += `\n${chunk}`;
      }
    }

    return reconstructed;
  } catch (error) {
    console.error("Error retrieving section content:", error);
  }

  return result.content;
}

export function calculateSearchStats(
  results: VectorSearchResult[],
): SearchStats {
  if (results.length === 0) {
    return {
      totalResults: 0,
      averageScore: 0,
      maxScore: 0,
      minScore: 0,
      sourceTypes: {},
    };
  }

  const scores = results.map((r) => r.score);
  const sourceTypes: Record<string, number> = {};

  for (const result of results) {
    const type = (result.metadata?.sourceType as string) || "unknown";
    sourceTypes[type] = (sourceTypes[type] || 0) + 1;
  }

  return {
    totalResults: results.length,
    averageScore: scores.reduce((a, b) => a + b, 0) / scores.length,
    maxScore: Math.max(...scores),
    minScore: Math.min(...scores),
    sourceTypes,
  };
}

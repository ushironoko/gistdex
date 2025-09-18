import { vi } from "vitest";
import type { BatchEmbeddingOptions } from "../../src/core/embedding/embedding.js";

/**
 * Setup mocks for embedding generation functions
 * This avoids calling the actual Google AI API during tests
 */
export function setupEmbeddingMocks() {
  vi.mock("../../src/core/embedding/embedding.js", () => ({
    generateEmbedding: vi.fn((text: string) => {
      return Promise.resolve(createConsistentMockEmbedding(text, 768));
    }),
    generateEmbeddings: vi.fn((texts: string[]) => {
      return Promise.resolve(
        texts.map((text) => createConsistentMockEmbedding(text, 768)),
      );
    }),
    generateEmbeddingsBatch: vi.fn(
      (texts: string[], options?: BatchEmbeddingOptions) => {
        const embeddings = texts.map((text) =>
          createConsistentMockEmbedding(text, 768),
        );
        // Call onProgress callback if provided
        if (options?.onProgress) {
          for (let i = 1; i <= texts.length; i++) {
            options.onProgress(i, texts.length);
          }
        }
        return Promise.resolve(embeddings);
      },
    ),
    EMBEDDING_MODEL: "gemini-embedding-001",
    EMBEDDING_DIMENSION: 768,
    cosineSimilarity: (embedding1: number[], embedding2: number[]) => {
      if (embedding1.length !== embedding2.length) {
        throw new Error("Embeddings must have the same dimension");
      }
      let dotProduct = 0;
      let magnitude1 = 0;
      let magnitude2 = 0;
      for (let i = 0; i < embedding1.length; i++) {
        const val1 = embedding1[i];
        const val2 = embedding2[i];
        if (val1 !== undefined && val2 !== undefined) {
          dotProduct += val1 * val2;
          magnitude1 += val1 * val1;
          magnitude2 += val2 * val2;
        }
      }
      magnitude1 = Math.sqrt(magnitude1);
      magnitude2 = Math.sqrt(magnitude2);
      if (magnitude1 === 0 || magnitude2 === 0) {
        return 0;
      }
      return dotProduct / (magnitude1 * magnitude2);
    },
  }));
}

/**
 * Create consistent mock embeddings for testing
 * These embeddings are deterministic based on the input text
 */
export function createConsistentMockEmbedding(
  text: string,
  dimension: number = 768,
): number[] {
  const embedding = new Array(dimension);
  // Use text hash to create deterministic but varied embeddings
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }

  // Create deterministic embedding based on hash
  for (let i = 0; i < dimension; i++) {
    const seed = hash + i;
    embedding[i] = Math.sin(seed) * 0.5 + Math.cos(seed * 2) * 0.5;
  }

  // Normalize
  const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return embedding.map((val) => val / norm);
}

/**
 * Mock for generateEmbeddingsBatch that creates consistent embeddings
 */
export function mockGenerateEmbeddingsBatch(texts: string[]): number[][] {
  return texts.map((text) => createConsistentMockEmbedding(text, 768));
}

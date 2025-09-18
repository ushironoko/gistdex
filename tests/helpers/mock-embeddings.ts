import { vi } from "vitest";
import type { BatchEmbeddingOptions } from "../../src/core/embedding/embedding.js";
import { createMockEmbedding } from "./test-db.js";

/**
 * Setup mocks for embedding generation functions
 * This avoids calling the actual Google AI API during tests
 */
export function setupEmbeddingMocks() {
  vi.mock("../../src/core/embedding/embedding.js", () => ({
    generateEmbedding: vi.fn((_text: string) => {
      return Promise.resolve(createMockEmbedding(768));
    }),
    generateEmbeddings: vi.fn((texts: string[]) => {
      return Promise.resolve(texts.map(() => createMockEmbedding(768)));
    }),
    generateEmbeddingsBatch: vi.fn(
      (texts: string[], options?: BatchEmbeddingOptions) => {
        const embeddings = texts.map(() => createMockEmbedding(768));
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

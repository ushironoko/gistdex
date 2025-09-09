import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  cosineSimilarity,
  EMBEDDING_DIMENSION,
  EMBEDDING_MODEL,
  generateEmbedding,
  generateEmbeddings,
  generateEmbeddingsBatch,
  normalizeEmbedding,
} from "./embedding.js";

// Mock the AI SDK
vi.mock("@ai-sdk/google", () => ({
  google: {
    textEmbedding: vi.fn(),
  },
}));

vi.mock("ai", () => ({
  embed: vi.fn(),
  embedMany: vi.fn(),
}));

// Import the mocked functions
import { google } from "@ai-sdk/google";
import { embed, embedMany } from "ai";

describe("embedding constants", () => {
  test("has correct default values", () => {
    expect(EMBEDDING_MODEL).toBe("gemini-embedding-001");
    expect(EMBEDDING_DIMENSION).toBe(768);
  });
});

describe("generateEmbedding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("generates embedding for single text", async () => {
    const mockEmbedding = [0.1, 0.2, 0.3];
    const normalizedEmbedding = normalizeEmbedding(mockEmbedding);
    const mockModel = { model: "test-model" };

    vi.mocked(google.textEmbedding).mockReturnValue(mockModel as any);
    vi.mocked(embed).mockResolvedValue({ embedding: mockEmbedding } as any);

    const result = await generateEmbedding("test text");

    expect(google.textEmbedding).toHaveBeenCalledWith(EMBEDDING_MODEL);
    expect(embed).toHaveBeenCalledWith({
      model: mockModel,
      value: "test text",
      providerOptions: {
        google: {
          outputDimensionality: 768,
        },
      },
    });
    // Result should be normalized when using 768 dimensions
    expect(result).toEqual(normalizedEmbedding);
  });

  test("uses custom model when provided", async () => {
    const mockEmbedding = [0.4, 0.5, 0.6];
    const normalizedEmbedding = normalizeEmbedding(mockEmbedding);
    const mockModel = { model: "custom-model" };

    vi.mocked(google.textEmbedding).mockReturnValue(mockModel as any);
    vi.mocked(embed).mockResolvedValue({ embedding: mockEmbedding } as any);

    const result = await generateEmbedding("test text", {
      model: "custom-model",
    });

    expect(google.textEmbedding).toHaveBeenCalledWith("custom-model");
    // Result should be normalized when using 768 dimensions
    expect(result).toEqual(normalizedEmbedding);
  });

  test("throws error on API failure", async () => {
    const mockModel = { model: "test-model" };
    const apiError = new Error("API Error");

    vi.mocked(google.textEmbedding).mockReturnValue(mockModel as any);
    vi.mocked(embed).mockRejectedValue(apiError);

    await expect(generateEmbedding("test text")).rejects.toThrow(
      "Failed to generate embedding for text",
    );

    try {
      await generateEmbedding("test text");
    } catch (error: any) {
      expect(error.cause).toBe(apiError);
    }
  });

  test("handles empty text", async () => {
    const mockEmbedding = [0, 0, 0];
    // Zero vector remains zero after normalization
    const mockModel = { model: "test-model" };

    vi.mocked(google.textEmbedding).mockReturnValue(mockModel as any);
    vi.mocked(embed).mockResolvedValue({ embedding: mockEmbedding } as any);

    const result = await generateEmbedding("");

    expect(embed).toHaveBeenCalledWith({
      model: mockModel,
      value: "",
      providerOptions: {
        google: {
          outputDimensionality: 768,
        },
      },
    });
    expect(result).toEqual(mockEmbedding); // Zero vector remains zero
  });

  test("normalizes embeddings when using 768 dimensions", async () => {
    const mockEmbedding = [3, 4]; // Will be normalized to [0.6, 0.8]
    const mockModel = { model: "test-model" };

    vi.mocked(google.textEmbedding).mockReturnValue(mockModel as any);
    vi.mocked(embed).mockResolvedValue({
      embedding: mockEmbedding,
    } as any);

    const result = await generateEmbedding("test text");

    // Check that the result is normalized (magnitude = 1)
    const magnitude = Math.sqrt(
      result.reduce((sum, val) => sum + val * val, 0),
    );
    expect(magnitude).toBeCloseTo(1, 5);
    expect(result).toEqual([0.6, 0.8]);
  });
});

describe("generateEmbeddings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("generates embeddings for multiple texts", async () => {
    const mockEmbeddings = [
      [0.1, 0.2],
      [0.3, 0.4],
      [0.5, 0.6],
    ];
    const normalizedEmbeddings = mockEmbeddings.map((e) =>
      normalizeEmbedding(e),
    );
    const mockModel = { model: "test-model" };

    vi.mocked(google.textEmbedding).mockReturnValue(mockModel as any);
    vi.mocked(embedMany).mockResolvedValue({
      embeddings: mockEmbeddings,
    } as any);

    const texts = ["text1", "text2", "text3"];
    const result = await generateEmbeddings(texts);

    expect(google.textEmbedding).toHaveBeenCalledWith(EMBEDDING_MODEL);
    expect(embedMany).toHaveBeenCalledWith({
      model: mockModel,
      values: texts,
      providerOptions: {
        google: {
          outputDimensionality: 768,
        },
      },
    });
    // Results should be normalized when using 768 dimensions
    expect(result).toEqual(normalizedEmbeddings);
  });

  test("returns empty array for empty input", async () => {
    const result = await generateEmbeddings([]);

    expect(result).toEqual([]);
    expect(embedMany).not.toHaveBeenCalled();
  });

  test("uses custom model when provided", async () => {
    const mockEmbeddings = [[0.1, 0.2]];
    const normalizedEmbeddings = mockEmbeddings.map((e) =>
      normalizeEmbedding(e),
    );
    const mockModel = { model: "custom-model" };

    vi.mocked(google.textEmbedding).mockReturnValue(mockModel as any);
    vi.mocked(embedMany).mockResolvedValue({
      embeddings: mockEmbeddings,
    } as any);

    const result = await generateEmbeddings(["text1"], {
      model: "custom-model",
    });

    expect(google.textEmbedding).toHaveBeenCalledWith("custom-model");
    expect(result).toEqual(normalizedEmbeddings);
  });

  test("throws error on API failure", async () => {
    const mockModel = { model: "test-model" };
    const apiError = new Error("API Error");

    vi.mocked(google.textEmbedding).mockReturnValue(mockModel as any);
    vi.mocked(embedMany).mockRejectedValue(apiError);

    await expect(generateEmbeddings(["text1", "text2"])).rejects.toThrow(
      "Failed to generate embeddings for 2 texts",
    );

    try {
      await generateEmbeddings(["text1", "text2"]);
    } catch (error: any) {
      expect(error.cause).toBe(apiError);
    }
  });
});

describe("generateEmbeddingsBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("handles small batches by calling generateEmbeddings", async () => {
    const mockEmbeddings = [
      [0.1, 0.2],
      [0.3, 0.4],
    ];
    const normalizedEmbeddings = mockEmbeddings.map((e) =>
      normalizeEmbedding(e),
    );
    const mockModel = { model: "test-model" };

    vi.mocked(google.textEmbedding).mockReturnValue(mockModel as any);
    vi.mocked(embedMany).mockResolvedValue({
      embeddings: mockEmbeddings,
    } as any);

    const texts = ["text1", "text2"];
    const result = await generateEmbeddingsBatch(texts, { batchSize: 10 });

    // Results should be normalized when using 768 dimensions
    expect(result).toEqual(normalizedEmbeddings);
    expect(embedMany).toHaveBeenCalledOnce();
  });

  test("processes large batches in chunks", async () => {
    const mockEmbeddings1 = [
      [0.1, 0.2],
      [0.3, 0.4],
    ];
    const mockEmbeddings2 = [
      [0.5, 0.6],
      [0.7, 0.8],
    ];
    const mockEmbeddings3 = [[0.9, 1.0]];
    const normalizedEmbeddings1 = mockEmbeddings1.map((e) =>
      normalizeEmbedding(e),
    );
    const normalizedEmbeddings2 = mockEmbeddings2.map((e) =>
      normalizeEmbedding(e),
    );
    const normalizedEmbeddings3 = mockEmbeddings3.map((e) =>
      normalizeEmbedding(e),
    );
    const mockModel = { model: "test-model" };

    vi.mocked(google.textEmbedding).mockReturnValue(mockModel as any);
    vi.mocked(embedMany)
      .mockResolvedValueOnce({ embeddings: mockEmbeddings1 } as any)
      .mockResolvedValueOnce({ embeddings: mockEmbeddings2 } as any)
      .mockResolvedValueOnce({ embeddings: mockEmbeddings3 } as any);

    const texts = ["text1", "text2", "text3", "text4", "text5"];
    const result = await generateEmbeddingsBatch(texts, { batchSize: 2 });

    // Results should be normalized when using 768 dimensions
    expect(result).toEqual([
      ...normalizedEmbeddings1,
      ...normalizedEmbeddings2,
      ...normalizedEmbeddings3,
    ]);
    expect(embedMany).toHaveBeenCalledTimes(3);

    // Check batch calls
    expect(embedMany).toHaveBeenNthCalledWith(1, {
      model: mockModel,
      values: ["text1", "text2"],
      providerOptions: {
        google: {
          outputDimensionality: 768,
        },
      },
    });
    expect(embedMany).toHaveBeenNthCalledWith(2, {
      model: mockModel,
      values: ["text3", "text4"],
      providerOptions: {
        google: {
          outputDimensionality: 768,
        },
      },
    });
    expect(embedMany).toHaveBeenNthCalledWith(3, {
      model: mockModel,
      values: ["text5"],
      providerOptions: {
        google: {
          outputDimensionality: 768,
        },
      },
    });
  });

  test("calls onProgress callback", async () => {
    const mockEmbeddings1 = [
      [0.1, 0.2],
      [0.3, 0.4],
    ];
    const mockEmbeddings2 = [[0.5, 0.6]];
    const mockModel = { model: "test-model" };
    const onProgress = vi.fn();

    vi.mocked(google.textEmbedding).mockReturnValue(mockModel as any);
    vi.mocked(embedMany)
      .mockResolvedValueOnce({ embeddings: mockEmbeddings1 } as any)
      .mockResolvedValueOnce({ embeddings: mockEmbeddings2 } as any);

    const texts = ["text1", "text2", "text3"];
    await generateEmbeddingsBatch(texts, { batchSize: 2, onProgress });

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, 2, 3); // After first batch
    expect(onProgress).toHaveBeenNthCalledWith(2, 3, 3); // After second batch
  });

  test("returns empty array for empty input", async () => {
    const result = await generateEmbeddingsBatch([]);

    expect(result).toEqual([]);
    expect(embedMany).not.toHaveBeenCalled();
  });

  test("uses custom model and batch size", async () => {
    const mockEmbeddings = [[0.1, 0.2]];
    const mockModel = { model: "custom-model" };

    vi.mocked(google.textEmbedding).mockReturnValue(mockModel as any);
    vi.mocked(embedMany).mockResolvedValue({
      embeddings: mockEmbeddings,
    } as any);

    await generateEmbeddingsBatch(["text1"], {
      model: "custom-model",
      batchSize: 5,
    });

    expect(google.textEmbedding).toHaveBeenCalledWith("custom-model");
  });

  test("throws error on batch failure with batch information", async () => {
    const mockEmbeddings1 = [[0.1, 0.2]];
    const mockModel = { model: "test-model" };
    const apiError = new Error("API Error");

    vi.mocked(google.textEmbedding).mockReturnValue(mockModel as any);
    vi.mocked(embedMany)
      .mockResolvedValueOnce({ embeddings: mockEmbeddings1 } as any)
      .mockRejectedValueOnce(apiError);

    await expect(
      generateEmbeddingsBatch(["text1", "text2", "text3"], { batchSize: 1 }),
    ).rejects.toThrow("Failed to generate embeddings for batch 2");

    try {
      await generateEmbeddingsBatch(["text1", "text2", "text3"], {
        batchSize: 1,
      });
    } catch (error: any) {
      expect(error.cause).toBe(apiError);
    }
  });
});

describe("normalizeEmbedding", () => {
  test("normalizes vector to unit length", () => {
    const embedding = [3, 4, 0]; // Magnitude = 5
    const result = normalizeEmbedding(embedding);

    expect(result).toEqual([0.6, 0.8, 0]);

    // Verify unit length (magnitude = 1)
    const magnitude = Math.sqrt(
      result.reduce((sum, val) => sum + val * val, 0),
    );
    expect(magnitude).toBeCloseTo(1, 10);
  });

  test("handles zero vector", () => {
    const embedding = [0, 0, 0];
    const result = normalizeEmbedding(embedding);

    expect(result).toEqual([0, 0, 0]);
  });

  test("handles single dimension vector", () => {
    const embedding = [5];
    const result = normalizeEmbedding(embedding);

    expect(result).toEqual([1]);
  });

  test("handles negative values", () => {
    const embedding = [-3, 4]; // Magnitude = 5
    const result = normalizeEmbedding(embedding);

    expect(result).toEqual([-0.6, 0.8]);

    // Verify unit length
    const magnitude = Math.sqrt(
      result.reduce((sum, val) => sum + val * val, 0),
    );
    expect(magnitude).toBeCloseTo(1, 10);
  });

  test("preserves already normalized vector", () => {
    const embedding = [0.6, 0.8]; // Already unit length
    const result = normalizeEmbedding(embedding);

    expect(result[0]).toBeCloseTo(0.6, 10);
    expect(result[1]).toBeCloseTo(0.8, 10);
  });
});

describe("cosineSimilarity", () => {
  test("calculates similarity between identical vectors", () => {
    const embedding1 = [1, 2, 3];
    const embedding2 = [1, 2, 3];
    const result = cosineSimilarity(embedding1, embedding2);

    expect(result).toBeCloseTo(1, 10);
  });

  test("calculates similarity between orthogonal vectors", () => {
    const embedding1 = [1, 0, 0];
    const embedding2 = [0, 1, 0];
    const result = cosineSimilarity(embedding1, embedding2);

    expect(result).toBeCloseTo(0, 10);
  });

  test("calculates similarity between opposite vectors", () => {
    const embedding1 = [1, 2, 3];
    const embedding2 = [-1, -2, -3];
    const result = cosineSimilarity(embedding1, embedding2);

    expect(result).toBeCloseTo(-1, 10);
  });

  test("handles normalized vectors", () => {
    const embedding1 = [0.6, 0.8];
    const embedding2 = [0.8, 0.6];
    const result = cosineSimilarity(embedding1, embedding2);

    // Dot product = 0.6 * 0.8 + 0.8 * 0.6 = 0.96
    expect(result).toBeCloseTo(0.96, 10);
  });

  test("throws error for different dimension vectors", () => {
    const embedding1 = [1, 2, 3];
    const embedding2 = [1, 2];

    expect(() => cosineSimilarity(embedding1, embedding2)).toThrow(
      "Embeddings must have the same dimension",
    );
  });

  test("handles zero vectors", () => {
    const embedding1 = [0, 0, 0];
    const embedding2 = [1, 2, 3];
    const result = cosineSimilarity(embedding1, embedding2);

    expect(result).toBe(0);
  });

  test("handles both zero vectors", () => {
    const embedding1 = [0, 0, 0];
    const embedding2 = [0, 0, 0];
    const result = cosineSimilarity(embedding1, embedding2);

    expect(result).toBe(0);
  });

  test("works with different magnitudes", () => {
    const embedding1 = [1, 1]; // Magnitude: √2
    const embedding2 = [2, 2]; // Magnitude: 2√2, same direction
    const result = cosineSimilarity(embedding1, embedding2);

    expect(result).toBeCloseTo(1, 10);
  });

  test("handles single dimension vectors", () => {
    const embedding1 = [5];
    const embedding2 = [3];
    const result = cosineSimilarity(embedding1, embedding2);

    expect(result).toBeCloseTo(1, 10);
  });

  test("handles mixed positive and negative values", () => {
    const embedding1 = [1, -1, 2];
    const embedding2 = [2, -2, 4];
    const result = cosineSimilarity(embedding1, embedding2);

    // Same direction, should be close to 1
    expect(result).toBeCloseTo(1, 10);
  });
});

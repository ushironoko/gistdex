import {
  beforeEach,
  describe,
  expect,
  jest,
  type Mock,
  mock,
  test,
} from "bun:test";
import {
  cosineSimilarity,
  EMBEDDING_DIMENSION,
  EMBEDDING_MODEL,
  generateEmbedding,
  generateEmbeddings,
  generateEmbeddingsBatch,
  normalizeEmbedding,
} from "./embedding.js";

// Only mock external APIs - Google AI SDK
mock.module("@ai-sdk/google", () => ({
  google: {
    textEmbedding: jest.fn(),
  },
}));

mock.module("ai", () => ({
  embed: jest.fn(),
  embedMany: jest.fn(),
}));

import { google } from "@ai-sdk/google";
import { embed, embedMany } from "ai";

describe("embedding constants", () => {
  test("has correct default values", () => {
    expect(EMBEDDING_MODEL).toBe("gemini-embedding-001");
    expect(EMBEDDING_DIMENSION).toBe(768);
  });
});

describe("normalizeEmbedding", () => {
  test("normalizes a vector to unit length", () => {
    const vector = [3, 4]; // 3-4-5 triangle
    const normalized = normalizeEmbedding(vector);

    expect(normalized).toHaveLength(2);
    expect(normalized[0]).toBeCloseTo(0.6, 5);
    expect(normalized[1]).toBeCloseTo(0.8, 5);

    // Check that it's unit length
    const magnitude = Math.sqrt(
      (normalized[0] ?? 0) ** 2 + (normalized[1] ?? 0) ** 2,
    );
    expect(magnitude).toBeCloseTo(1, 5);
  });

  test("handles zero vector", () => {
    const vector = [0, 0, 0];
    const normalized = normalizeEmbedding(vector);

    expect(normalized).toEqual([0, 0, 0]);
  });

  test("handles already normalized vector", () => {
    const vector = [1, 0, 0];
    const normalized = normalizeEmbedding(vector);

    expect(normalized).toEqual([1, 0, 0]);
  });

  test("normalizes large dimensional vectors", () => {
    const vector = Array(768).fill(1);
    const normalized = normalizeEmbedding(vector);

    expect(normalized).toHaveLength(768);

    // Check unit length
    const magnitude = Math.sqrt(
      normalized.reduce((sum, val) => sum + val ** 2, 0),
    );
    expect(magnitude).toBeCloseTo(1, 5);
  });
});

describe("cosineSimilarity", () => {
  test("calculates cosine similarity between two vectors", () => {
    const a = [1, 0, 0];
    const b = [1, 0, 0];

    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBeCloseTo(1, 5); // Identical vectors
  });

  test("returns 0 for orthogonal vectors", () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];

    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBeCloseTo(0, 5);
  });

  test("returns -1 for opposite vectors", () => {
    const a = [1, 0, 0];
    const b = [-1, 0, 0];

    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBeCloseTo(-1, 5);
  });

  test("handles different magnitude vectors", () => {
    const a = [3, 4, 0];
    const b = [6, 8, 0]; // Same direction, different magnitude

    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBeCloseTo(1, 5);
  });

  test("throws error for vectors of different lengths", () => {
    const a = [1, 0];
    const b = [1, 0, 0];

    expect(() => cosineSimilarity(a, b)).toThrow();
  });

  test("handles zero vectors", () => {
    const a = [0, 0, 0];
    const b = [1, 0, 0];

    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBe(0);
  });
});

describe("generateEmbedding (with API mock)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("generates embedding for single text", async () => {
    const mockEmbedding = Array(768).fill(0.1);
    const normalizedEmbedding = normalizeEmbedding(mockEmbedding);
    const mockModel = { model: "test-model" };

    (google.textEmbedding as Mock<typeof google.textEmbedding>).mockReturnValue(
      mockModel as unknown as ReturnType<typeof google.textEmbedding>,
    );
    (embed as Mock<typeof embed>).mockResolvedValue({
      embedding: mockEmbedding,
    } as unknown as Awaited<ReturnType<typeof embed>>);

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
    expect(result).toEqual(normalizedEmbedding);
    expect(result).toHaveLength(768);
  });

  test("handles empty text", async () => {
    const mockEmbedding = Array(768).fill(0);
    const normalizedEmbedding = normalizeEmbedding(mockEmbedding);
    const mockModel = { model: "test-model" };

    (google.textEmbedding as Mock<typeof google.textEmbedding>).mockReturnValue(
      mockModel as unknown as ReturnType<typeof google.textEmbedding>,
    );
    (embed as Mock<typeof embed>).mockResolvedValue({
      embedding: mockEmbedding,
    } as unknown as Awaited<ReturnType<typeof embed>>);

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
    expect(result).toEqual(normalizedEmbedding);
  });

  test("handles API errors gracefully", async () => {
    const mockModel = { model: "test-model" };

    (google.textEmbedding as Mock<typeof google.textEmbedding>).mockReturnValue(
      mockModel as unknown as ReturnType<typeof google.textEmbedding>,
    );
    (embed as Mock<typeof embed>).mockRejectedValue(new Error("API Error"));

    await expect(generateEmbedding("test")).rejects.toThrow(
      "Failed to generate embedding for text",
    );
  });
});

describe("generateEmbeddings (with API mock)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("generates embeddings for multiple texts", async () => {
    const texts = ["text1", "text2", "text3"];
    const mockEmbeddings = [
      Array(768).fill(0.1),
      Array(768).fill(0.2),
      Array(768).fill(0.3),
    ];
    const normalizedEmbeddings = mockEmbeddings.map(normalizeEmbedding);
    const mockModel = { model: "test-model" };

    (google.textEmbedding as Mock<typeof google.textEmbedding>).mockReturnValue(
      mockModel as unknown as ReturnType<typeof google.textEmbedding>,
    );
    (embedMany as Mock<typeof embedMany>).mockResolvedValue({
      embeddings: mockEmbeddings,
    } as unknown as Awaited<ReturnType<typeof embedMany>>);

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
    expect(result).toEqual(normalizedEmbeddings);
    expect(result).toHaveLength(3);
    result.forEach((embedding) => {
      expect(embedding).toHaveLength(768);
    });
  });

  test("handles empty array", async () => {
    const result = await generateEmbeddings([]);

    expect(result).toEqual([]);
    expect(embedMany).not.toHaveBeenCalled();
  });

  test("handles single text", async () => {
    const mockEmbedding = Array(768).fill(0.5);
    const normalizedEmbedding = normalizeEmbedding(mockEmbedding);
    const mockModel = { model: "test-model" };

    (google.textEmbedding as Mock<typeof google.textEmbedding>).mockReturnValue(
      mockModel as unknown as ReturnType<typeof google.textEmbedding>,
    );
    (embedMany as Mock<typeof embedMany>).mockResolvedValue({
      embeddings: [mockEmbedding],
    } as unknown as Awaited<ReturnType<typeof embedMany>>);

    const result = await generateEmbeddings(["single text"]);

    expect(embedMany).toHaveBeenCalledWith({
      model: mockModel,
      values: ["single text"],
      providerOptions: {
        google: {
          outputDimensionality: 768,
        },
      },
    });
    expect(result).toEqual([normalizedEmbedding]);
  });
});

describe("generateEmbeddingsBatch (with API mock)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("processes texts in batches", async () => {
    const texts = Array(25)
      .fill(null)
      .map((_, i) => `text${i}`);
    const batchSize = 10;

    // Mock embeddings for each batch
    const mockBatch1 = Array(10)
      .fill(null)
      .map(() => Array(768).fill(0.1));
    const mockBatch2 = Array(10)
      .fill(null)
      .map(() => Array(768).fill(0.2));
    const mockBatch3 = Array(5)
      .fill(null)
      .map(() => Array(768).fill(0.3));

    const mockModel = { model: "test-model" };

    (google.textEmbedding as Mock<typeof google.textEmbedding>).mockReturnValue(
      mockModel as unknown as ReturnType<typeof google.textEmbedding>,
    );

    (embedMany as Mock<typeof embedMany>)
      .mockResolvedValueOnce({
        embeddings: mockBatch1,
      } as unknown as Awaited<ReturnType<typeof embedMany>>)
      .mockResolvedValueOnce({
        embeddings: mockBatch2,
      } as unknown as Awaited<ReturnType<typeof embedMany>>)
      .mockResolvedValueOnce({
        embeddings: mockBatch3,
      } as unknown as Awaited<ReturnType<typeof embedMany>>);

    const result = await generateEmbeddingsBatch(texts, { batchSize });

    expect(embedMany).toHaveBeenCalledTimes(3);
    // Check that providerOptions was included in each call
    expect(embedMany).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOptions: {
          google: {
            outputDimensionality: 768,
          },
        },
      }),
    );
    expect(result).toHaveLength(25);
    result.forEach((embedding) => {
      expect(embedding).toHaveLength(768);
    });
  });

  test("handles batch size larger than input", async () => {
    const texts = ["text1", "text2"];
    const batchSize = 10;
    const mockEmbeddings = [Array(768).fill(0.1), Array(768).fill(0.2)];
    const mockModel = { model: "test-model" };

    (google.textEmbedding as Mock<typeof google.textEmbedding>).mockReturnValue(
      mockModel as unknown as ReturnType<typeof google.textEmbedding>,
    );
    (embedMany as Mock<typeof embedMany>).mockResolvedValue({
      embeddings: mockEmbeddings,
    } as unknown as Awaited<ReturnType<typeof embedMany>>);

    const result = await generateEmbeddingsBatch(texts, { batchSize });

    expect(embedMany).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(2);
  });

  test("uses default batch size", async () => {
    const texts = Array(150)
      .fill(null)
      .map((_, i) => `text${i}`);
    const mockModel = { model: "test-model" };

    (google.textEmbedding as Mock<typeof google.textEmbedding>).mockReturnValue(
      mockModel as unknown as ReturnType<typeof google.textEmbedding>,
    );

    // Mock for default batch size of 100
    (embedMany as Mock<typeof embedMany>)
      .mockResolvedValueOnce({
        embeddings: Array(100)
          .fill(null)
          .map(() => Array(768).fill(0.1)),
      } as unknown as Awaited<ReturnType<typeof embedMany>>)
      .mockResolvedValueOnce({
        embeddings: Array(50)
          .fill(null)
          .map(() => Array(768).fill(0.2)),
      } as unknown as Awaited<ReturnType<typeof embedMany>>);

    const result = await generateEmbeddingsBatch(texts);

    expect(embedMany).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(150);
  });

  test("handles empty input", async () => {
    const result = await generateEmbeddingsBatch([], { batchSize: 10 });

    expect(result).toEqual([]);
    expect(embedMany).not.toHaveBeenCalled();
  });

  test("propagates API errors", async () => {
    const texts = ["text1", "text2"];
    const mockModel = { model: "test-model" };

    (google.textEmbedding as Mock<typeof google.textEmbedding>).mockReturnValue(
      mockModel as unknown as ReturnType<typeof google.textEmbedding>,
    );
    (embedMany as Mock<typeof embedMany>).mockRejectedValue(
      new Error("Batch API Error"),
    );

    await expect(
      generateEmbeddingsBatch(texts, { batchSize: 10 }),
    ).rejects.toThrow("Failed to generate embeddings for 2 texts");
  });
});

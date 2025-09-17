import { expect } from "vitest";
import type { VectorSearchResult } from "../../src/core/vector-db/adapters/types.js";

export function assertSearchResultValid(result: VectorSearchResult): void {
  expect(result).toBeDefined();
  expect(result.id).toBeDefined();
  expect(typeof result.id).toBe("string");
  expect(result.content).toBeDefined();
  expect(typeof result.content).toBe("string");
  expect(result.score).toBeDefined();
  expect(typeof result.score).toBe("number");
  expect(result.score).toBeGreaterThanOrEqual(0);
  expect(result.score).toBeLessThanOrEqual(1.2); // Allow small floating point errors
  expect(result.metadata).toBeDefined();
  expect(typeof result.metadata).toBe("object");
}

export function assertSearchResultsOrdered(
  results: VectorSearchResult[],
  descending: boolean = true,
): void {
  for (let i = 1; i < results.length; i++) {
    if (descending) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    } else {
      expect(results[i - 1].score).toBeLessThanOrEqual(results[i].score);
    }
  }
}

export function assertEmbeddingValid(
  embedding: number[],
  dimension: number = 768,
): void {
  expect(embedding).toBeDefined();
  expect(Array.isArray(embedding)).toBe(true);
  expect(embedding.length).toBe(dimension);

  for (const value of embedding) {
    expect(typeof value).toBe("number");
    expect(Number.isNaN(value)).toBe(false);
    expect(value).toBeGreaterThanOrEqual(-1.5);
    expect(value).toBeLessThanOrEqual(1.5);
  }

  const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  expect(norm).toBeCloseTo(1, 5);
}

export function assertChunksValid(
  chunks: string[],
  originalText: string,
  options: { maxSize?: number; minSize?: number } = {},
): void {
  const { maxSize = 1000, minSize = 10 } = options;

  expect(chunks).toBeDefined();
  expect(Array.isArray(chunks)).toBe(true);
  expect(chunks.length).toBeGreaterThan(0);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    expect(typeof chunk).toBe("string");
    expect(chunk.length).toBeGreaterThan(minSize);

    if (i < chunks.length - 1) {
      expect(chunk.length).toBeLessThanOrEqual(maxSize);
    }

    expect(originalText).toContain(chunk.trim());
  }
}

export function assertMetadataValid(
  metadata: Record<string, unknown>,
  requiredFields: string[] = [],
): void {
  expect(metadata).toBeDefined();
  expect(typeof metadata).toBe("object");

  for (const field of requiredFields) {
    expect(metadata[field]).toBeDefined();
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 5000,
  errorMessage: string = "Operation timed out",
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs),
    ),
  ]);
}

export async function retryAsync<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 100,
): Promise<T> {
  let lastError: Error | unknown;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}

export function measureTime<T>(
  fn: () => T,
  label?: string,
): { result: T; duration: number } {
  const start = performance.now();
  const result = fn();
  const duration = performance.now() - start;

  if (label) {
    console.log(`${label}: ${duration.toFixed(2)}ms`);
  }

  return { result, duration };
}

export async function measureTimeAsync<T>(
  fn: () => Promise<T>,
  label?: string,
): Promise<{ result: T; duration: number }> {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;

  if (label) {
    console.log(`${label}: ${duration.toFixed(2)}ms`);
  }

  return { result, duration };
}

export function assertSimilarContent(
  actual: string,
  expected: string,
  threshold: number = 0.9,
): void {
  const actualWords = new Set(actual.toLowerCase().split(/\s+/));
  const expectedWords = new Set(expected.toLowerCase().split(/\s+/));

  const intersection = new Set(
    [...actualWords].filter((word) => expectedWords.has(word)),
  );

  const similarity =
    intersection.size / Math.max(actualWords.size, expectedWords.size);

  expect(similarity).toBeGreaterThanOrEqual(threshold);
}

export function createTestEnvironment(
  env: Record<string, string> = {},
): () => void {
  const originalEnv = { ...process.env };

  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }

  return () => {
    for (const key of Object.keys(env)) {
      if (originalEnv[key] !== undefined) {
        process.env[key] = originalEnv[key];
      } else {
        delete process.env[key];
      }
    }
  };
}

export function extractContentFromResults(
  results: VectorSearchResult[],
): string[] {
  return results.map((r) => r.content);
}

export function extractScoresFromResults(
  results: VectorSearchResult[],
): number[] {
  return results.map((r) => r.score);
}

export function findResultByContent(
  results: VectorSearchResult[],
  contentSubstring: string,
): VectorSearchResult | undefined {
  return results.find((r) => r.content.includes(contentSubstring));
}

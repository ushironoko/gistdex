import { describe, expect, it } from "vitest";
import {
  calculateCosineSimilarity,
  calculateMagnitude,
  dotProduct,
  dotProductSimilarity,
} from "./math-utils.js";

describe("math-utils", () => {
  describe("dotProduct", () => {
    it("should calculate dot product of two vectors", () => {
      const vec1 = [1, 2, 3];
      const vec2 = [4, 5, 6];
      expect(dotProduct(vec1, vec2)).toBe(32); // 1*4 + 2*5 + 3*6
    });

    it("should return 0 for orthogonal vectors", () => {
      const vec1 = [1, 0];
      const vec2 = [0, 1];
      expect(dotProduct(vec1, vec2)).toBe(0);
    });

    it("should handle empty vectors", () => {
      expect(dotProduct([], [])).toBe(0);
    });

    it("should handle vectors of different lengths by using minimum length", () => {
      const vec1 = [1, 2, 3];
      const vec2 = [4, 5];
      expect(dotProduct(vec1, vec2)).toBe(14); // 1*4 + 2*5
    });
  });

  describe("calculateMagnitude", () => {
    it("should calculate magnitude of a vector", () => {
      const vec = [3, 4];
      expect(calculateMagnitude(vec)).toBe(5); // sqrt(9 + 16)
    });

    it("should return 0 for empty vector", () => {
      expect(calculateMagnitude([])).toBe(0);
    });

    it("should handle single element vector", () => {
      expect(calculateMagnitude([5])).toBe(5);
    });

    it("should handle negative values", () => {
      const vec = [-3, 4];
      expect(calculateMagnitude(vec)).toBe(5); // sqrt(9 + 16)
    });
  });

  describe("calculateCosineSimilarity", () => {
    it("should calculate cosine similarity between two vectors", () => {
      const vec1 = [1, 0];
      const vec2 = [1, 0];
      expect(calculateCosineSimilarity(vec1, vec2)).toBe(1); // identical vectors
    });

    it("should return -1 for opposite vectors", () => {
      const vec1 = [1, 0];
      const vec2 = [-1, 0];
      expect(calculateCosineSimilarity(vec1, vec2)).toBe(-1);
    });

    it("should return 0 for orthogonal vectors", () => {
      const vec1 = [1, 0];
      const vec2 = [0, 1];
      expect(calculateCosineSimilarity(vec1, vec2)).toBe(0);
    });

    it("should handle zero vectors", () => {
      const vec1 = [0, 0];
      const vec2 = [1, 1];
      expect(calculateCosineSimilarity(vec1, vec2)).toBe(0);
    });

    it("should handle both zero vectors", () => {
      const vec1 = [0, 0];
      const vec2 = [0, 0];
      expect(calculateCosineSimilarity(vec1, vec2)).toBe(0);
    });

    it("should calculate similarity for non-normalized vectors", () => {
      const vec1 = [2, 0];
      const vec2 = [5, 0];
      expect(calculateCosineSimilarity(vec1, vec2)).toBe(1); // same direction
    });

    it("should handle high-dimensional vectors", () => {
      const vec1 = [1, 2, 3, 4, 5];
      const vec2 = [1, 2, 3, 4, 5];
      expect(calculateCosineSimilarity(vec1, vec2)).toBe(1);
    });

    it("should handle vectors with different lengths", () => {
      const vec1 = [1, 2, 3];
      const vec2 = [1, 2];
      // Only first 2 dimensions are used
      const expected = (1 + 4) / (Math.sqrt(14) * Math.sqrt(5));
      expect(calculateCosineSimilarity(vec1, vec2)).toBeCloseTo(expected, 5);
    });

    it("should match the original implementation for typical embeddings", () => {
      // Test case from original implementation
      const vec1 = [0.1, 0.2, 0.3, 0.4];
      const vec2 = [0.2, 0.3, 0.4, 0.5];

      // Calculate expected value
      const dot = 0.02 + 0.06 + 0.12 + 0.2; // 0.4
      const mag1 = Math.sqrt(0.01 + 0.04 + 0.09 + 0.16); // sqrt(0.3)
      const mag2 = Math.sqrt(0.04 + 0.09 + 0.16 + 0.25); // sqrt(0.54)
      const expected = dot / (mag1 * mag2);

      expect(calculateCosineSimilarity(vec1, vec2)).toBeCloseTo(expected, 5);
    });
  });

  describe("dotProductSimilarity", () => {
    it("should calculate dot product similarity for normalized vectors", () => {
      const vec1 = [0.6, 0.8]; // normalized vector (magnitude = 1)
      const vec2 = [0.6, 0.8];
      expect(dotProductSimilarity(vec1, vec2)).toBe(1.0);
    });

    it("should be equivalent to cosine similarity for normalized vectors", () => {
      const vec1 = [0.6, 0.8];
      const vec2 = [0.8, 0.6];
      const dotSim = dotProductSimilarity(vec1, vec2);
      const cosSim = calculateCosineSimilarity(vec1, vec2);
      expect(dotSim).toBeCloseTo(cosSim, 10);
    });

    it("should handle embedding-sized vectors efficiently", () => {
      // Create normalized 768-dimensional vectors (typical embedding size)
      const vec1 = new Array(768).fill(0);
      const vec2 = new Array(768).fill(0);
      vec1[0] = 1; // unit vector in first dimension
      vec2[0] = 1; // same direction

      const result = dotProductSimilarity(vec1, vec2);
      expect(result).toBe(1.0);
    });
  });

  describe("calculateCosineSimilarity optimization", () => {
    it("should use fast path for 768-dimensional vectors", () => {
      // Create 768-dimensional vectors (embedding size)
      const vec1 = new Array(768).fill(0);
      const vec2 = new Array(768).fill(0);
      vec1[0] = 1;
      vec2[0] = 0.8;
      vec2[1] = 0.6;

      // This should use the optimized path (dot product only)
      const result = calculateCosineSimilarity(vec1, vec2);
      expect(result).toBe(0.8); // dot product of [1,0,0,...] and [0.8,0.6,0,...]
    });

    it("should use fast path for 1536-dimensional vectors", () => {
      const vec1 = new Array(1536).fill(0);
      const vec2 = new Array(1536).fill(0);
      vec1[0] = 1;
      vec2[0] = 1;

      const result = calculateCosineSimilarity(vec1, vec2);
      expect(result).toBe(1.0);
    });

    it("should use fast path for 3072-dimensional vectors", () => {
      const vec1 = new Array(3072).fill(0);
      const vec2 = new Array(3072).fill(0);
      vec1[0] = 0.6;
      vec1[1] = 0.8;
      vec2[0] = 0.6;
      vec2[1] = 0.8;

      const result = calculateCosineSimilarity(vec1, vec2);
      expect(result).toBe(1.0);
    });

    it("should use standard calculation for non-embedding dimensions", () => {
      // 100-dimensional vectors (not a typical embedding size)
      const vec1 = new Array(100).fill(0);
      const vec2 = new Array(100).fill(0);
      vec1[0] = 3;
      vec1[1] = 4; // magnitude = 5
      vec2[0] = 3;
      vec2[1] = 4; // magnitude = 5

      const result = calculateCosineSimilarity(vec1, vec2);
      expect(result).toBe(1.0); // Same vector, should still be 1
    });
  });
});

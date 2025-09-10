import { describe, expect, it } from "vitest";
import { calculateSimilarityScore, sortByScore } from "./ranking.js";

describe("Ranking Utilities", () => {
  describe("sortByScore", () => {
    it("should sort items by score in descending order", () => {
      const items = [
        { id: 1, score: 0.5 },
        { id: 2, score: 0.9 },
        { id: 3, score: 0.1 },
        { id: 4, score: 0.7 },
      ];

      const sorted = sortByScore(items);

      expect(sorted[0]?.score).toBe(0.9);
      expect(sorted[1]?.score).toBe(0.7);
      expect(sorted[2]?.score).toBe(0.5);
      expect(sorted[3]?.score).toBe(0.1);
    });

    it("should handle empty arrays", () => {
      expect(sortByScore([])).toEqual([]);
    });

    it("should not mutate original array", () => {
      const items = [{ score: 0.5 }, { score: 0.9 }];
      const original = [...items];

      sortByScore(items);
      expect(items).toEqual(original);
    });

    it("should sort with custom score accessor", () => {
      const items = [
        { relevance: 0.5 },
        { relevance: 0.9 },
        { relevance: 0.1 },
      ];

      const sorted = sortByScore(items, (item) => item.relevance);

      expect(sorted[0]?.relevance).toBe(0.9);
      expect(sorted[1]?.relevance).toBe(0.5);
      expect(sorted[2]?.relevance).toBe(0.1);
    });
  });

  describe("calculateSimilarityScore", () => {
    it("should calculate cosine similarity between vectors", () => {
      const vec1 = [1, 0, 0];
      const vec2 = [1, 0, 0];

      expect(calculateSimilarityScore(vec1, vec2)).toBeCloseTo(1.0);
    });

    it("should return 0 for orthogonal vectors", () => {
      const vec1 = [1, 0];
      const vec2 = [0, 1];

      expect(calculateSimilarityScore(vec1, vec2)).toBeCloseTo(0);
    });

    it("should handle negative similarity", () => {
      const vec1 = [1, 0];
      const vec2 = [-1, 0];

      expect(calculateSimilarityScore(vec1, vec2)).toBeCloseTo(-1);
    });

    it("should throw for vectors of different lengths", () => {
      const vec1 = [1, 2];
      const vec2 = [1, 2, 3];

      expect(() => calculateSimilarityScore(vec1, vec2)).toThrow(
        "Vectors must have the same dimension",
      );
    });
  });
});

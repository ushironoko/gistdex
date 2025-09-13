import { beforeEach, describe, expect, it } from "vitest";
import type {
  EvaluationMetrics,
  ExpectedResult,
  SearchResult,
} from "./result-evaluator.js";
import { createResultEvaluator } from "./result-evaluator.js";

describe("ResultEvaluator", () => {
  let evaluator: ReturnType<typeof createResultEvaluator>;

  beforeEach(() => {
    evaluator = createResultEvaluator();
  });

  describe("evaluate", () => {
    it("should calculate metrics for search results", () => {
      const expected: ExpectedResult = {
        keywords: ["vitepress", "config", "export"],
        patterns: [/export\s+default/i],
        minConfidence: 0.7,
        minMatches: 2,
      };

      const actual: SearchResult[] = [
        {
          content: "export default defineConfig for VitePress configuration",
          metadata: { sourceType: "file", path: "config.js" },
          score: 0.9,
          chunkIndex: 0,
          sourceId: "test-1",
        },
        {
          content: "VitePress setup guide with config examples",
          metadata: { sourceType: "file", path: "guide.md" },
          score: 0.8,
          chunkIndex: 0,
          sourceId: "test-2",
        },
      ];

      const metrics = evaluator.evaluate(actual, expected);

      expect(metrics).toMatchObject({
        keywordMatch: expect.any(Number),
        patternMatch: expect.any(Number),
        semanticSimilarity: expect.any(Number),
        coverage: expect.any(Number),
        precision: expect.any(Number),
        recall: expect.any(Number),
      });

      expect(metrics.keywordMatch).toBeGreaterThan(0);
      expect(metrics.patternMatch).toBeGreaterThan(0);
    });

    it("should return zero metrics for empty results", () => {
      const expected: ExpectedResult = {
        keywords: ["test"],
        patterns: [],
        minConfidence: 0.5,
        minMatches: 1,
      };

      const metrics = evaluator.evaluate([], expected);

      expect(metrics.keywordMatch).toBe(0);
      expect(metrics.coverage).toBe(0);
      expect(metrics.precision).toBe(0);
    });

    it("should handle results without matching keywords", () => {
      const expected: ExpectedResult = {
        keywords: ["nonexistent", "missing"],
        patterns: [],
        minConfidence: 0.7,
        minMatches: 1,
      };

      const actual: SearchResult[] = [
        {
          content: "completely different content",
          metadata: { sourceType: "file" },
          score: 0.5,
          chunkIndex: 0,
          sourceId: "test-1",
        },
      ];

      const metrics = evaluator.evaluate(actual, expected);

      expect(metrics.keywordMatch).toBe(0);
      expect(metrics.recall).toBe(0);
    });
  });

  describe("generateFeedback", () => {
    it("should generate positive feedback for good metrics", () => {
      const metrics: EvaluationMetrics = {
        keywordMatch: 0.9,
        patternMatch: 0.8,
        semanticSimilarity: 0.85,
        coverage: 1.0,
        precision: 0.9,
        recall: 0.85,
      };

      const expected: ExpectedResult = {
        keywords: ["test"],
        patterns: [],
        minConfidence: 0.7,
        minMatches: 1,
      };

      const feedback = evaluator.generateFeedback(metrics, expected);

      expect(feedback).toContain("good");
      expect(feedback.toLowerCase()).not.toContain("improve");
    });

    it("should generate improvement suggestions for poor metrics", () => {
      const metrics: EvaluationMetrics = {
        keywordMatch: 0.2,
        patternMatch: 0.1,
        semanticSimilarity: 0.3,
        coverage: 0.5,
        precision: 0.2,
        recall: 0.1,
      };

      const expected: ExpectedResult = {
        keywords: ["test", "vitest", "coverage"],
        patterns: [],
        minConfidence: 0.8,
        minMatches: 5,
      };

      const feedback = evaluator.generateFeedback(metrics, expected);

      expect(feedback.toLowerCase()).toContain("low");
      expect(feedback).toContain("keyword");
    });
  });

  describe("suggestImprovements", () => {
    it("should suggest adding keywords for low keyword matches", () => {
      const query = "test";
      const metrics: EvaluationMetrics = {
        keywordMatch: 0.2,
        patternMatch: 0.5,
        semanticSimilarity: 0.4,
        coverage: 0.5,
        precision: 0.3,
        recall: 0.2,
      };

      const results: SearchResult[] = [
        {
          content: "simple test file",
          metadata: { sourceType: "file" },
          score: 0.5,
          chunkIndex: 0,
          sourceId: "test-1",
        },
      ];

      const suggestions = evaluator.suggestImprovements(
        query,
        metrics,
        results,
      );

      expect(suggestions).toBeInstanceOf(Array);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some((s) => s.includes("keyword"))).toBe(true);
    });

    it("should suggest broadening search for low coverage", () => {
      const query = "very specific term";
      const metrics: EvaluationMetrics = {
        keywordMatch: 0.8,
        patternMatch: 0.7,
        semanticSimilarity: 0.75,
        coverage: 0.2,
        precision: 0.8,
        recall: 0.2,
      };

      const results: SearchResult[] = [];

      const suggestions = evaluator.suggestImprovements(
        query,
        metrics,
        results,
      );

      expect(suggestions.some((s) => s.toLowerCase().includes("broad"))).toBe(
        true,
      );
    });
  });

  describe("calculateScore", () => {
    it("should calculate weighted score from metrics", () => {
      const metrics: EvaluationMetrics = {
        keywordMatch: 0.8,
        patternMatch: 0.7,
        semanticSimilarity: 0.9,
        coverage: 1.0,
        precision: 0.85,
        recall: 0.75,
      };

      const score = evaluator.calculateScore(metrics);

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
      expect(score).toBeCloseTo(0.83, 1);
    });

    it("should return 0 for all zero metrics", () => {
      const metrics: EvaluationMetrics = {
        keywordMatch: 0,
        patternMatch: 0,
        semanticSimilarity: 0,
        coverage: 0,
        precision: 0,
        recall: 0,
      };

      const score = evaluator.calculateScore(metrics);

      expect(score).toBe(0);
    });

    it("should handle partial metrics correctly", () => {
      const metrics: EvaluationMetrics = {
        keywordMatch: 1.0,
        patternMatch: 0,
        semanticSimilarity: 0.5,
        coverage: 0.5,
        precision: 1.0,
        recall: 0,
      };

      const score = evaluator.calculateScore(metrics);

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });
  });
});

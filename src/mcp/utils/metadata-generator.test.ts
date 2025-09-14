import { describe, expect, it } from "vitest";
import type { VectorSearchResult } from "../../core/vector-db/adapters/types.js";
import {
  analyzeContentTypes,
  analyzeKeywordCoverage,
  analyzeSemanticCoherence,
  calculateScoreDistribution,
  createExecutionContext,
  generateAnalysisMetadata,
  generateStrategicHints,
} from "./metadata-generator.js";

describe("metadata-generator", () => {
  const mockResults: VectorSearchResult[] = [
    {
      id: "1",
      content: "TypeScript is a programming language that builds on JavaScript",
      score: 0.9,
      metadata: { sourceType: "file" },
    },
    {
      id: "2",
      content: "function example() { return 'Hello TypeScript'; }",
      score: 0.7,
      metadata: { sourceType: "file" },
    },
    {
      id: "3",
      content: "JavaScript is a dynamic programming language",
      score: 0.5,
      metadata: { sourceType: "text" },
    },
  ];

  describe("calculateScoreDistribution", () => {
    it("should correctly categorize scores", () => {
      const distribution = calculateScoreDistribution(mockResults);

      expect(distribution.high).toBe(1); // 0.9
      expect(distribution.medium).toBe(2); // 0.7, 0.5
      expect(distribution.low).toBe(0);
      expect(distribution.histogram).toContainEqual({
        range: "0.9-1.0",
        count: 1,
      });
      expect(distribution.histogram).toContainEqual({
        range: "0.5-0.6",
        count: 1,
      });
    });

    it("should handle empty results", () => {
      const distribution = calculateScoreDistribution([]);

      expect(distribution.high).toBe(0);
      expect(distribution.medium).toBe(0);
      expect(distribution.low).toBe(0);
      expect(distribution.histogram).toEqual([]);
    });
  });

  describe("analyzeKeywordCoverage", () => {
    it("should analyze keyword presence in results", () => {
      const coverage = analyzeKeywordCoverage(
        "TypeScript programming",
        mockResults,
      );

      expect(coverage.queryKeywords).toContain("typescript");
      expect(coverage.queryKeywords).toContain("programming");
      expect(coverage.foundKeywords).toContain("typescript");
      expect(coverage.foundKeywords).toContain("programming");
      expect(coverage.missingKeywords).toHaveLength(0);
      expect(coverage.coverageRatio).toBe(1);
    });

    it("should identify missing keywords", () => {
      const coverage = analyzeKeywordCoverage(
        "Python Django framework",
        mockResults,
      );

      expect(coverage.queryKeywords).toContain("python");
      expect(coverage.queryKeywords).toContain("django");
      expect(coverage.queryKeywords).toContain("framework");
      expect(coverage.foundKeywords).not.toContain("python");
      expect(coverage.foundKeywords).not.toContain("django");
      expect(coverage.missingKeywords).toContain("python");
      expect(coverage.missingKeywords).toContain("django");
      expect(coverage.coverageRatio).toBeLessThan(1);
    });

    it("should support Japanese keywords", () => {
      const japaneseResults: VectorSearchResult[] = [
        {
          id: "1",
          content:
            "TypeScriptはJavaScriptの上に構築されたプログラミング言語です",
          score: 0.9,
          metadata: { sourceType: "file" },
        },
        {
          id: "2",
          content: "関数型プログラミングのパラダイムを実装する",
          score: 0.7,
          metadata: { sourceType: "file" },
        },
      ];

      const coverage = analyzeKeywordCoverage(
        "TypeScriptの関数型プログラミングについて",
        japaneseResults,
      );

      expect(coverage.queryKeywords).toContain("typescript");
      expect(coverage.queryKeywords).toContain("関数型");
      expect(coverage.queryKeywords).toContain("プログラミング");
      expect(coverage.queryKeywords).not.toContain("の"); // Stop word should be filtered
      expect(coverage.queryKeywords).not.toContain("について"); // Stop word should be filtered
      expect(coverage.foundKeywords).toContain("typescript");
      expect(coverage.foundKeywords).toContain("関数型");
      expect(coverage.foundKeywords).toContain("プログラミング");
    });

    it("should handle mixed Japanese and English", () => {
      const mixedResults: VectorSearchResult[] = [
        {
          id: "1",
          content: "async/awaitは非同期処理を扱うための機能です",
          score: 0.9,
          metadata: { sourceType: "file" },
        },
      ];

      const coverage = analyzeKeywordCoverage(
        "async/awaitの非同期処理",
        mixedResults,
      );

      expect(coverage.queryKeywords).toContain("async");
      expect(coverage.queryKeywords).toContain("await");
      expect(coverage.queryKeywords).toContain("非同期処理");
      expect(coverage.foundKeywords).toContain("async");
      expect(coverage.foundKeywords).toContain("await");
      expect(coverage.foundKeywords).toContain("非同期処理");
    });
  });

  describe("analyzeSemanticCoherence", () => {
    it("should calculate coherence and diversity", () => {
      const analysis = analyzeSemanticCoherence(mockResults);

      expect(analysis.coherence).toBeGreaterThan(0);
      expect(analysis.coherence).toBeLessThanOrEqual(1);
      expect(analysis.diversity).toBeGreaterThan(0);
      expect(analysis.diversity).toBeLessThanOrEqual(1);
      expect(analysis.topicClusters).toBeInstanceOf(Array);
    });

    it("should identify topic clusters", () => {
      const analysis = analyzeSemanticCoherence(mockResults);

      const typescriptCluster = analysis.topicClusters.find(
        (c) => c.topic === "typescript",
      );
      expect(typescriptCluster).toBeDefined();
      expect(typescriptCluster?.resultIndices).toContain(0);
      expect(typescriptCluster?.resultIndices).toContain(1);
    });
  });

  describe("analyzeContentTypes", () => {
    it("should detect content types", () => {
      const analysis = analyzeContentTypes(mockResults);

      expect(analysis.totalContentLength).toBeGreaterThan(0);
      expect(analysis.avgContentLength).toBeGreaterThan(0);

      const codeType = analysis.contentTypes.find((t) => t.type === "code");
      expect(codeType).toBeDefined();
      expect(codeType?.count).toBe(1);

      // The test data doesn't contain markdown patterns, so it will be classified as "text"
      const textType = analysis.contentTypes.find((t) => t.type === "text");
      expect(textType).toBeDefined();
      expect(textType?.count).toBe(2);
    });

    it("should handle empty results", () => {
      const analysis = analyzeContentTypes([]);

      expect(analysis.totalContentLength).toBe(0);
      expect(analysis.avgContentLength).toBe(0);
      expect(analysis.contentTypes).toEqual([]);
    });
  });

  describe("generateAnalysisMetadata", () => {
    it("should generate complete metadata", async () => {
      const metadata = await generateAnalysisMetadata(
        "TypeScript programming",
        mockResults,
      );

      expect(metadata.scoreDistribution).toBeDefined();
      expect(metadata.keywordCoverage).toBeDefined();
      expect(metadata.semanticAnalysis).toBeDefined();
      expect(metadata.contentAnalysis).toBeDefined();
    });
  });

  describe("generateStrategicHints", () => {
    it("should suggest broadening for no high-quality matches", () => {
      const lowScoreResults: VectorSearchResult[] = [
        {
          id: "1",
          content: "Some content",
          score: 0.3,
          metadata: {},
        },
      ];

      const metadata = {
        scoreDistribution: calculateScoreDistribution(lowScoreResults),
        keywordCoverage: analyzeKeywordCoverage("test query", lowScoreResults),
        semanticAnalysis: analyzeSemanticCoherence(lowScoreResults),
        contentAnalysis: analyzeContentTypes(lowScoreResults),
      };

      const hints = generateStrategicHints(
        "test query",
        lowScoreResults,
        metadata,
      );

      expect(hints.possibleIssues).toContainEqual(
        expect.objectContaining({
          issue: "No high-quality matches found",
          severity: "high",
        }),
      );

      expect(hints.queryOptimizations).toContainEqual(
        expect.objectContaining({
          type: "broaden",
        }),
      );
    });

    it("should suggest indexing for few results", () => {
      const fewResults: VectorSearchResult[] = [
        {
          id: "1",
          content: "Single result",
          score: 0.8,
          metadata: {},
        },
      ];

      const metadata = {
        scoreDistribution: calculateScoreDistribution(fewResults),
        keywordCoverage: analyzeKeywordCoverage("test", fewResults),
        semanticAnalysis: analyzeSemanticCoherence(fewResults),
        contentAnalysis: analyzeContentTypes(fewResults),
      };

      const hints = generateStrategicHints("test", fewResults, metadata);

      expect(hints.suggestedTools).toContainEqual(
        expect.objectContaining({
          tool: "gistdex_index",
          reason: "Few results found, consider indexing more content",
        }),
      );
    });
  });

  describe("createExecutionContext", () => {
    it("should create a valid execution context", () => {
      const context = createExecutionContext("test query");

      expect(context.queryId).toBeDefined();
      expect(context.timestamp).toBeGreaterThan(0);
      expect(context.executionTime).toBe(0);
      expect(context.indexInfo).toBeDefined();
      expect(context.indexInfo.totalDocuments).toBe(0);
      expect(context.indexInfo.sources).toEqual([]);
    });
  });
});

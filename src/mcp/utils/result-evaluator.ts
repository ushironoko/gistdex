export interface EvaluationMetrics {
  keywordMatch: number; // キーワード一致率（0-1）
  patternMatch: number; // パターン一致率（0-1）
  semanticSimilarity: number; // 意味的類似度（0-1）
  coverage: number; // カバレッジ（0-1）
  precision: number; // 精度（0-1）
  recall: number; // 再現率（0-1）
}

export interface ExpectedResult {
  keywords: string[];
  patterns: RegExp[];
  minConfidence: number;
  minMatches: number;
}

export interface SearchResult {
  content: string;
  metadata?: {
    sourceType?: string;
    path?: string;
    [key: string]: unknown;
  };
  score: number;
  id?: string;
  chunkIndex?: number;
  sourceId?: string;
}

function calculateKeywordMetrics(
  results: SearchResult[],
  keywords: string[],
): { match: number; precision: number; recall: number } {
  if (results.length === 0 || keywords.length === 0) {
    return { match: 0, precision: 0, recall: 0 };
  }

  let totalMatches = 0;
  let documentsWithKeywords = 0;

  for (const result of results) {
    const content = result.content.toLowerCase();
    const matchedKeywords = keywords.filter((keyword) =>
      content.includes(keyword.toLowerCase()),
    );

    if (matchedKeywords.length > 0) {
      documentsWithKeywords++;
      totalMatches += matchedKeywords.length;
    }
  }

  const match = totalMatches / (results.length * keywords.length);
  const precision = documentsWithKeywords / results.length;
  const recall = totalMatches / keywords.length / Math.max(results.length, 1);

  return { match, precision, recall };
}

function calculatePatternMetrics(
  results: SearchResult[],
  patterns: RegExp[],
): number {
  if (results.length === 0 || patterns.length === 0) {
    return patterns.length === 0 ? 1 : 0;
  }

  let totalMatches = 0;

  for (const result of results) {
    for (const pattern of patterns) {
      if (pattern.test(result.content)) {
        totalMatches++;
      }
    }
  }

  return totalMatches / (results.length * patterns.length);
}

function calculateSemanticSimilarity(results: SearchResult[]): number {
  if (results.length === 0) {
    return 0;
  }

  const avgScore =
    results.reduce((sum, r) => sum + r.score, 0) / results.length;
  return avgScore;
}

export function createResultEvaluator() {
  return {
    evaluate(
      actual: SearchResult[],
      expected: ExpectedResult,
    ): EvaluationMetrics {
      const keywordMetrics = calculateKeywordMetrics(actual, expected.keywords);

      const patternMatch = calculatePatternMetrics(actual, expected.patterns);

      const semanticSimilarity = calculateSemanticSimilarity(actual);

      const coverage = Math.min(actual.length / expected.minMatches, 1);

      return {
        keywordMatch: keywordMetrics.match,
        patternMatch,
        semanticSimilarity,
        coverage,
        precision: keywordMetrics.precision,
        recall: keywordMetrics.recall,
      };
    },

    generateFeedback(
      metrics: EvaluationMetrics,
      expected: ExpectedResult,
    ): string {
      const parts: string[] = [];

      if (metrics.keywordMatch >= 0.7) {
        parts.push("Keyword matching is good");
      } else if (metrics.keywordMatch < 0.3) {
        parts.push(
          `Low keyword match (${(metrics.keywordMatch * 100).toFixed(1)}%)`,
        );
      }

      if (metrics.coverage < 0.5) {
        parts.push(`Coverage is low (${(metrics.coverage * 100).toFixed(1)}%)`);
      }

      if (metrics.semanticSimilarity < expected.minConfidence) {
        parts.push(
          `Semantic similarity below threshold (${metrics.semanticSimilarity.toFixed(2)} < ${expected.minConfidence})`,
        );
      }

      if (metrics.precision < 0.5) {
        parts.push("Low precision in results");
      }

      if (parts.length === 0) {
        if (metrics.keywordMatch >= 0.7 && metrics.coverage >= 0.8) {
          parts.push("Results meet expectations with good coverage");
        } else {
          parts.push("Results are acceptable");
        }
      }

      return parts.join(". ");
    },

    suggestImprovements(
      query: string,
      metrics: EvaluationMetrics,
      results: SearchResult[],
    ): string[] {
      const suggestions: string[] = [];

      if (metrics.keywordMatch < 0.5) {
        suggestions.push("Add more specific keywords to the query");
      }

      if (metrics.coverage <= 0.2) {
        suggestions.push("Broaden the search criteria to find more results");
      }

      if (metrics.precision < 0.5 && query.split(" ").length > 3) {
        suggestions.push("Try using fewer, more focused terms");
      }

      if (metrics.semanticSimilarity < 0.5) {
        suggestions.push("Consider using synonyms or related terms");
      }

      if (results.length === 0) {
        suggestions.push("Check spelling and try alternative terms");
      }

      if (suggestions.length === 0) {
        suggestions.push("Query is well-optimized");
      }

      return suggestions;
    },

    calculateScore(metrics: EvaluationMetrics): number {
      // 重み付けスコア計算
      const weights = {
        keywordMatch: 0.25,
        patternMatch: 0.15,
        semanticSimilarity: 0.25,
        coverage: 0.15,
        precision: 0.1,
        recall: 0.1,
      };

      const score =
        metrics.keywordMatch * weights.keywordMatch +
        metrics.patternMatch * weights.patternMatch +
        metrics.semanticSimilarity * weights.semanticSimilarity +
        metrics.coverage * weights.coverage +
        metrics.precision * weights.precision +
        metrics.recall * weights.recall;

      return Math.min(Math.max(score, 0), 1);
    },
  };
}

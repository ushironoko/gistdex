/**
 * Score analysis utilities for search results
 */

import type { VectorSearchResult } from "../../core/vector-db/adapters/types.js";

/**
 * Detailed metrics for search result scores
 */
export interface DetailedScoreMetrics {
  totalResults: number;
  avgScore: number;
  maxScore: number;
  minScore: number;
  scoreVariance: number;
  scoreStandardDeviation: number;
  medianScore: number;
  scorePercentiles: {
    p25: number;
    p50: number;
    p75: number;
    p90: number;
  };
}

/**
 * Score distribution categories
 */
export interface ScoreDistribution {
  high: number; // >= 0.8
  medium: number; // 0.5 - 0.8
  low: number; // < 0.5
  histogram: Array<{
    range: string;
    count: number;
  }>;
}

/**
 * Combined score analysis
 */
export interface ScoreAnalysis {
  metrics: DetailedScoreMetrics;
  distribution: ScoreDistribution;
}

/**
 * Calculate detailed metrics from search results
 */
export function calculateDetailedMetrics(
  results: VectorSearchResult[],
): DetailedScoreMetrics {
  if (results.length === 0) {
    return {
      totalResults: 0,
      avgScore: 0,
      maxScore: 0,
      minScore: 0,
      scoreVariance: 0,
      scoreStandardDeviation: 0,
      medianScore: 0,
      scorePercentiles: {
        p25: 0,
        p50: 0,
        p75: 0,
        p90: 0,
      },
    };
  }

  const scores = results.map((r) => r.score).sort((a, b) => a - b);
  const sum = scores.reduce((acc, score) => acc + score, 0);
  const avg = sum / scores.length;

  // Calculate variance and standard deviation
  const variance =
    scores.reduce((acc, score) => acc + (score - avg) ** 2, 0) / scores.length;
  const stdDev = Math.sqrt(variance);

  // Calculate percentiles
  const getPercentile = (p: number) => {
    const index = Math.ceil((p / 100) * scores.length) - 1;
    return scores[Math.max(0, Math.min(index, scores.length - 1))] ?? 0;
  };

  return {
    totalResults: results.length,
    avgScore: avg,
    maxScore: Math.max(...scores),
    minScore: Math.min(...scores),
    scoreVariance: variance,
    scoreStandardDeviation: stdDev,
    medianScore: getPercentile(50),
    scorePercentiles: {
      p25: getPercentile(25),
      p50: getPercentile(50),
      p75: getPercentile(75),
      p90: getPercentile(90),
    },
  };
}

/**
 * Calculate score distribution (high/medium/low and histogram)
 */
export function calculateScoreDistribution(
  results: VectorSearchResult[],
): ScoreDistribution {
  const distribution: ScoreDistribution = {
    high: 0,
    medium: 0,
    low: 0,
    histogram: [],
  };

  // Count results by score range
  for (const result of results) {
    if (result.score >= 0.8) {
      distribution.high++;
    } else if (result.score >= 0.5) {
      distribution.medium++;
    } else {
      distribution.low++;
    }
  }

  // Create histogram with 0.1 intervals
  const ranges = [
    "0.0-0.1",
    "0.1-0.2",
    "0.2-0.3",
    "0.3-0.4",
    "0.4-0.5",
    "0.5-0.6",
    "0.6-0.7",
    "0.7-0.8",
    "0.8-0.9",
    "0.9-1.0",
  ];

  for (const range of ranges) {
    const [minStr, maxStr] = range.split("-");
    const min = Number.parseFloat(minStr ?? "0");
    const max = Number.parseFloat(maxStr ?? "1");
    const count = results.filter((r) => r.score >= min && r.score < max).length;

    distribution.histogram.push({ range, count });
  }

  return distribution;
}

/**
 * Analyze scores comprehensively
 */
export function analyzeScores(results: VectorSearchResult[]): ScoreAnalysis {
  return {
    metrics: calculateDetailedMetrics(results),
    distribution: calculateScoreDistribution(results),
  };
}

/**
 * Get score quality assessment
 */
export function assessScoreQuality(
  analysis: ScoreAnalysis,
): "excellent" | "good" | "fair" | "poor" {
  const { metrics, distribution } = analysis;

  if (metrics.totalResults === 0) {
    return "poor";
  }

  // Assess based on average score and distribution
  if (
    metrics.avgScore >= 0.8 &&
    distribution.high >= metrics.totalResults * 0.5
  ) {
    return "excellent";
  }
  if (
    metrics.avgScore >= 0.6 &&
    distribution.high >= metrics.totalResults * 0.3
  ) {
    return "good";
  }
  if (metrics.avgScore >= 0.4) {
    return "fair";
  }
  return "poor";
}

/**
 * Format score analysis for display
 */
export function formatScoreAnalysis(analysis: ScoreAnalysis): string {
  const { metrics, distribution } = analysis;

  if (metrics.totalResults === 0) {
    return "No results to analyze";
  }

  const lines = [
    `Total Results: ${metrics.totalResults}`,
    `Average Score: ${metrics.avgScore.toFixed(3)}`,
    `Score Range: ${metrics.minScore.toFixed(3)} - ${metrics.maxScore.toFixed(3)}`,
    `Standard Deviation: ${metrics.scoreStandardDeviation.toFixed(3)}`,
    "",
    "Score Distribution:",
    `  High (≥0.8): ${distribution.high} results`,
    `  Medium (0.5-0.8): ${distribution.medium} results`,
    `  Low (<0.5): ${distribution.low} results`,
    "",
    "Percentiles:",
    `  25th: ${metrics.scorePercentiles.p25.toFixed(3)}`,
    `  50th (Median): ${metrics.scorePercentiles.p50.toFixed(3)}`,
    `  75th: ${metrics.scorePercentiles.p75.toFixed(3)}`,
    `  90th: ${metrics.scorePercentiles.p90.toFixed(3)}`,
  ];

  return lines.join("\n");
}

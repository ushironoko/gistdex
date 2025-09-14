import type { VectorSearchResult } from "../../core/vector-db/adapters/types.js";

/**
 * Score distribution analysis for search results
 */
export interface ScoreDistribution {
  high: number; // 0.8以上の結果数
  medium: number; // 0.5-0.8の結果数
  low: number; // 0.5未満の結果数
  histogram: Array<{
    range: string;
    count: number;
  }>;
}

/**
 * Keyword coverage analysis for search results
 */
export interface KeywordCoverage {
  queryKeywords: string[];
  foundKeywords: string[];
  missingKeywords: string[];
  coverageRatio: number; // 0-1
  keywordFrequency: Map<string, number>;
}

/**
 * Semantic analysis of search results
 */
export interface SemanticAnalysis {
  coherence: number; // 結果間の意味的一貫性 (0-1)
  diversity: number; // 結果の多様性 (0-1)
  topicClusters: Array<{
    topic: string;
    resultIndices: number[];
    confidence: number;
  }>;
}

/**
 * Content analysis of search results
 */
export interface ContentAnalysis {
  totalContentLength: number;
  avgContentLength: number;
  contentTypes: Array<{
    type: string; // "code", "documentation", "example", etc.
    count: number;
  }>;
}

/**
 * Analysis metadata for search results
 */
export interface AnalysisMetadata {
  scoreDistribution: ScoreDistribution;
  keywordCoverage: KeywordCoverage;
  semanticAnalysis: SemanticAnalysis;
  contentAnalysis: ContentAnalysis;
}

/**
 * Strategic hints for agent decision making
 */
export interface StrategicHints {
  suggestedTools: Array<{
    tool: string;
    strategy?: string;
    reason: string;
    confidence: number; // 0-1
    parameters?: Record<string, unknown>;
  }>;
  possibleIssues: Array<{
    issue: string;
    severity: "low" | "medium" | "high";
    suggestion: string;
  }>;
  queryOptimizations: Array<{
    type: "broaden" | "narrow" | "pivot" | "rephrase";
    suggestion: string;
    expectedImprovement: string;
  }>;
}

/**
 * Execution context information
 */
export interface ExecutionContext {
  queryId: string; // UUID for tracking
  timestamp: number;
  executionTime: number;
  indexInfo: {
    totalDocuments: number;
    lastUpdated: number;
    sources: string[];
  };
}

/**
 * Extract keywords from a query string (supports both English and Japanese)
 */
function extractKeywords(query: string): string[] {
  // Common English stop words
  const englishStopWords = new Set([
    "a",
    "an",
    "the",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
    "by",
    "from",
    "as",
    "is",
    "was",
    "are",
    "were",
    "been",
    "be",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "must",
    "can",
    "this",
    "that",
    "these",
    "those",
    "i",
    "you",
    "he",
    "she",
    "it",
    "we",
    "they",
    "what",
    "which",
    "who",
    "when",
    "where",
    "why",
    "how",
  ]);

  // Common Japanese particles and stop words
  const japaneseStopWords = new Set([
    "の",
    "に",
    "は",
    "を",
    "た",
    "が",
    "で",
    "て",
    "と",
    "し",
    "れ",
    "さ",
    "ある",
    "いる",
    "も",
    "する",
    "から",
    "な",
    "こと",
    "として",
    "い",
    "や",
    "など",
    "なる",
    "へ",
    "か",
    "だ",
    "これ",
    "それ",
    "あれ",
    "この",
    "その",
    "あの",
    "です",
    "ます",
    "でした",
    "ました",
    "ません",
    "でしょう",
    "だろう",
    "よう",
    "ため",
    "ので",
    "けど",
    "しかし",
    "また",
    "および",
    "または",
    "について",
    "にて",
    "より",
    "まで",
    "もの",
    "ところ",
    "という",
    "といった",
    "における",
    "において",
    "に関する",
    "に対する",
    "に対して",
  ]);

  // Detect if the query contains Japanese characters
  const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(query);

  const keywords: string[] = [];

  if (hasJapanese) {
    // Japanese text processing
    // Split by various delimiters including Japanese punctuation
    const japaneseTokens = query
      .split(/[\s、。！？・,;.!?]+/)
      .filter((word) => word.length > 0);

    for (const token of japaneseTokens) {
      // Extract meaningful parts from Japanese text
      // This is a simplified approach - ideally we'd use a proper morphological analyzer

      // Split mixed alphanumeric and Japanese
      const subTokens = token.split(
        /([a-zA-Z0-9]+|[\u3040-\u309F]+|[\u30A0-\u30FF]+|[\u4E00-\u9FAF]+)/,
      );

      for (const subToken of subTokens) {
        const lowerToken = subToken.toLowerCase();

        // Skip empty tokens and stop words
        if (
          !subToken ||
          japaneseStopWords.has(subToken) ||
          englishStopWords.has(lowerToken)
        ) {
          continue;
        }

        // For Japanese: keep tokens that are likely to be meaningful
        if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(subToken)) {
          // Skip single hiragana characters (likely particles)
          if (subToken.length === 1 && /[\u3040-\u309F]/.test(subToken)) {
            continue;
          }
          keywords.push(subToken);
        }
        // For English/alphanumeric: apply length filter
        else if (subToken.length > 2) {
          keywords.push(lowerToken);
        }
      }
    }
  } else {
    // English text processing (existing logic)
    const englishTokens = query
      .toLowerCase()
      .split(/[\s,;.!?]+/)
      .filter((word) => word.length > 2 && !englishStopWords.has(word));

    keywords.push(...englishTokens);
  }

  // Remove duplicates while preserving order
  return [...new Set(keywords)];
}

/**
 * Calculate score distribution for search results
 */
export function calculateScoreDistribution(
  results: VectorSearchResult[],
): ScoreDistribution {
  const distribution = {
    high: 0,
    medium: 0,
    low: 0,
    histogram: [] as Array<{ range: string; count: number }>,
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
    if (count > 0) {
      distribution.histogram.push({ range, count });
    }
  }

  return distribution;
}

/**
 * Analyze keyword coverage in search results
 */
export function analyzeKeywordCoverage(
  query: string,
  results: VectorSearchResult[],
): KeywordCoverage {
  const queryKeywords = extractKeywords(query);
  const foundKeywords = new Set<string>();
  const keywordFrequency = new Map<string, number>();

  // Analyze each result for keyword presence
  for (const result of results) {
    const contentLower = result.content.toLowerCase();
    for (const keyword of queryKeywords) {
      if (contentLower.includes(keyword)) {
        foundKeywords.add(keyword);
        keywordFrequency.set(keyword, (keywordFrequency.get(keyword) || 0) + 1);
      }
    }
  }

  const foundKeywordsArray = Array.from(foundKeywords);
  const missingKeywords = queryKeywords.filter((k) => !foundKeywords.has(k));

  return {
    queryKeywords,
    foundKeywords: foundKeywordsArray,
    missingKeywords,
    coverageRatio:
      queryKeywords.length > 0
        ? foundKeywordsArray.length / queryKeywords.length
        : 1,
    keywordFrequency,
  };
}

/**
 * Analyze semantic coherence and diversity of results
 */
export function analyzeSemanticCoherence(
  results: VectorSearchResult[],
): SemanticAnalysis {
  // Simple implementation based on common words and topics
  const allWords = new Set<string>();
  const wordCounts = new Map<string, number>();

  for (const result of results) {
    const words = extractKeywords(result.content);
    for (const word of words) {
      allWords.add(word);
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }
  }

  // Calculate coherence based on shared vocabulary
  const sharedWords = Array.from(wordCounts.entries()).filter(
    ([_, count]) => count > 1,
  ).length;
  const coherence = Math.min(1, sharedWords / (allWords.size || 1));

  // Calculate diversity using Simpson's diversity index
  const totalWords = Array.from(wordCounts.values()).reduce(
    (sum, count) => sum + count,
    0,
  );
  let diversity = 0;
  if (totalWords > 0) {
    for (const count of wordCounts.values()) {
      const proportion = count / totalWords;
      diversity += proportion * proportion;
    }
    diversity = 1 - diversity; // Simpson's diversity index
  }

  // Simple topic clustering based on common patterns
  const topicClusters = identifyTopicClusters(results, wordCounts);

  return {
    coherence,
    diversity,
    topicClusters,
  };
}

/**
 * Identify topic clusters in search results
 */
function identifyTopicClusters(
  results: VectorSearchResult[],
  wordCounts: Map<string, number>,
): Array<{ topic: string; resultIndices: number[]; confidence: number }> {
  // Find most frequent words as potential topics
  const topWords = Array.from(wordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);

  const clusters: Array<{
    topic: string;
    resultIndices: number[];
    confidence: number;
  }> = [];

  for (const topic of topWords) {
    const indices: number[] = [];
    for (let i = 0; i < results.length; i++) {
      if (results[i]?.content.toLowerCase().includes(topic)) {
        indices.push(i);
      }
    }

    if (indices.length > 0) {
      clusters.push({
        topic,
        resultIndices: indices,
        confidence: indices.length / results.length,
      });
    }
  }

  return clusters;
}

/**
 * Analyze content characteristics of search results
 */
export function analyzeContentTypes(
  results: VectorSearchResult[],
): ContentAnalysis {
  const contentTypes = new Map<string, number>();
  let totalLength = 0;

  for (const result of results) {
    totalLength += result.content.length;

    // Detect content type based on patterns
    const type = detectContentType(result.content);
    contentTypes.set(type, (contentTypes.get(type) || 0) + 1);
  }

  return {
    totalContentLength: totalLength,
    avgContentLength: results.length > 0 ? totalLength / results.length : 0,
    contentTypes: Array.from(contentTypes.entries()).map(([type, count]) => ({
      type,
      count,
    })),
  };
}

/**
 * Detect the type of content based on patterns
 */
function detectContentType(content: string): string {
  const lowerContent = content.toLowerCase();

  // Check for code patterns (must be first as it's most specific)
  if (
    /function\s+\w+\s*\(|const\s+\w+\s*=|class\s+\w+|import\s+.*from|export\s+/.test(
      content,
    )
  ) {
    return "code";
  }

  // Check for example patterns
  if (/example:|usage:|demo:|sample:/i.test(lowerContent)) {
    return "example";
  }

  // Check for configuration patterns
  if (
    /\{[\s\S]*".*":[\s\S]*\}/.test(content) ||
    /^\s*\w+:\s*\w+/m.test(content)
  ) {
    return "configuration";
  }

  // Check for documentation patterns (moved after more specific checks)
  if (/^#{1,6}\s+/.test(content) || /^\*\s+/.test(content)) {
    return "documentation";
  }

  // Default to text if no specific pattern matches
  return "text";
}

/**
 * Generate analysis metadata for search results
 */
export async function generateAnalysisMetadata(
  query: string,
  results: VectorSearchResult[],
): Promise<AnalysisMetadata> {
  // Run all analyses in parallel for performance
  const [
    scoreDistribution,
    keywordCoverage,
    semanticAnalysis,
    contentAnalysis,
  ] = await Promise.all([
    Promise.resolve(calculateScoreDistribution(results)),
    Promise.resolve(analyzeKeywordCoverage(query, results)),
    Promise.resolve(analyzeSemanticCoherence(results)),
    Promise.resolve(analyzeContentTypes(results)),
  ]);

  return {
    scoreDistribution,
    keywordCoverage,
    semanticAnalysis,
    contentAnalysis,
  };
}

/**
 * Generate strategic hints based on analysis
 */
export function generateStrategicHints(
  query: string,
  results: VectorSearchResult[],
  metadata: AnalysisMetadata,
): StrategicHints {
  const hints: StrategicHints = {
    suggestedTools: [],
    possibleIssues: [],
    queryOptimizations: [],
  };

  // Analyze score distribution for issues
  if (metadata.scoreDistribution.high === 0) {
    hints.possibleIssues.push({
      issue: "No high-quality matches found",
      severity: "high",
      suggestion:
        "Consider broadening the search or indexing more relevant content",
    });

    hints.queryOptimizations.push({
      type: "broaden",
      suggestion: `${query} OR related concepts`,
      expectedImprovement: "Find more general matches",
    });
  }

  // Check keyword coverage
  if (metadata.keywordCoverage.coverageRatio < 0.5) {
    hints.possibleIssues.push({
      issue: "Low keyword coverage in results",
      severity: "medium",
      suggestion: `Missing keywords: ${metadata.keywordCoverage.missingKeywords.join(", ")}`,
    });

    hints.queryOptimizations.push({
      type: "rephrase",
      suggestion: "Try using synonyms or alternative terms",
      expectedImprovement: "Better keyword matching",
    });
  }

  // Check result count
  if (results.length < 3) {
    hints.suggestedTools.push({
      tool: "gistdex_index",
      reason: "Few results found, consider indexing more content",
      confidence: 0.8,
      parameters: {
        type: "github",
      },
    });

    hints.queryOptimizations.push({
      type: "broaden",
      suggestion: "Remove specific terms and search for general concepts",
      expectedImprovement: "More diverse results",
    });
  }

  // Check semantic diversity
  if (metadata.semanticAnalysis.diversity < 0.3) {
    hints.possibleIssues.push({
      issue: "Results are too similar",
      severity: "low",
      suggestion:
        "Results lack diversity, consider different search strategies",
    });

    hints.suggestedTools.push({
      tool: "gistdex_query",
      strategy: "hybrid",
      reason: "Try hybrid search for more diverse results",
      confidence: 0.7,
      parameters: {
        hybrid: true,
      },
    });
  }

  // Check for specific content types
  const hasCode = metadata.contentAnalysis.contentTypes.some(
    (t) => t.type === "code",
  );
  const hasDocs = metadata.contentAnalysis.contentTypes.some(
    (t) => t.type === "documentation",
  );

  if (!hasCode && query.toLowerCase().includes("implement")) {
    hints.queryOptimizations.push({
      type: "narrow",
      suggestion: `${query} implementation code example`,
      expectedImprovement: "Find code implementations",
    });
  }

  if (!hasDocs && query.toLowerCase().includes("how")) {
    hints.queryOptimizations.push({
      type: "narrow",
      suggestion: `${query} documentation guide tutorial`,
      expectedImprovement: "Find documentation and guides",
    });
  }

  return hints;
}

/**
 * Create execution context for tracking
 */
export function createExecutionContext(_query: string): ExecutionContext {
  return {
    queryId: crypto.randomUUID(),
    timestamp: Date.now(),
    executionTime: 0, // Will be updated later
    indexInfo: {
      totalDocuments: 0, // Will be populated from database
      lastUpdated: Date.now(),
      sources: [], // Will be populated from database
    },
  };
}

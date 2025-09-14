import type { DatabaseService } from "../../core/database/database-service.js";
import {
  hybridSearch,
  rerankResults,
  semanticSearch,
} from "../../core/search/search.js";
import type { VectorSearchResult } from "../../core/vector-db/adapters/types.js";
import {
  type AgentQueryToolInput,
  agentQueryToolSchema,
} from "../schemas/validation.js";
import {
  analyzeContentTypes,
  analyzeSemanticCoherence,
} from "../utils/metadata-generator.js";
import {
  type BaseToolOptions,
  type BaseToolResult,
  createSuccessResponse,
  createToolHandler,
} from "../utils/tool-handler.js";

// Use the validated input type from schema
type AgentQueryInput = AgentQueryToolInput;

/**
 * Detailed metrics for agent decision making
 */
export interface DetailedMetrics {
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
 * Semantic analysis with topic clustering
 */
export interface EnhancedSemanticAnalysis {
  topicClusters: Array<{
    clusterId: string;
    mainTopic: string;
    keywords: string[];
    resultIndices: number[];
    coherenceScore: number;
  }>;
  coverageGaps: string[];
  redundancy: number;
  diversityIndex: number;
}

/**
 * Query analysis for understanding intent
 */
export interface QueryAnalysis {
  complexity: "simple" | "moderate" | "complex";
  specificity: number; // 0-1
  ambiguity: string[]; // Ambiguous parts
  queryType: "factual" | "exploratory" | "navigational" | "transactional";
  estimatedIntent: string;
  languageDetected: string;
}

/**
 * Content characteristics analysis
 */
export interface ContentCharacteristics {
  predominantType: "code" | "documentation" | "mixed" | "example";
  codeLanguages?: string[];
  hasExamples: boolean;
  hasImplementation: boolean;
  completeness: number; // 0-1
}

/**
 * Next action suggestions for agent
 */
export interface NextActionSuggestion {
  action: "refine" | "broaden" | "pivot" | "stop" | "index_more";
  reasoning: string;
  confidence: number; // 0-1
  suggestedQuery?: string;
  expectedOutcome?: string;
}

/**
 * Tool suggestions for agent
 */
export interface ToolSuggestion {
  tool: string;
  purpose: string;
  priority: "high" | "medium" | "low";
  estimatedValue: number; // 0-1
  parameters?: Record<string, unknown>;
}

/**
 * Strategic considerations for agent
 */
export interface StrategicConsideration {
  consideration: string;
  importance: "critical" | "important" | "minor";
  relatedActions: string[];
}

/**
 * Potential problems detection
 */
export interface PotentialProblem {
  problem: string;
  likelihood: number; // 0-1
  impact: "low" | "medium" | "high";
  mitigation: string;
}

/**
 * Progress tracking when goal is provided
 */
export interface ProgressTracking {
  goalAlignment: number; // 0-1
  estimatedCompletion: number; // 0-1
  missingPieces: string[];
  achievedMilestones: string[];
  suggestedNextMilestone?: string;
}

/**
 * Debug information for development
 */
export interface DebugInfo {
  queryExecutionTime: number;
  embeddingGenerationTime: number;
  vectorSearchTime: number;
  metadataGenerationTime: number;
  totalProcessingTime: number;
  indexStats: {
    totalDocuments: number;
    totalChunks: number;
    avgChunkSize: number;
    lastIndexUpdate: number;
  };
  queryVector?: number[];
  searchStrategy: string;
}

/**
 * Complete agent query response
 */
export interface AgentQueryResult extends BaseToolResult {
  results: VectorSearchResult[];
  analysis: {
    metrics: DetailedMetrics;
    semantic: EnhancedSemanticAnalysis;
    queryAnalysis: QueryAnalysis;
    contentCharacteristics: ContentCharacteristics;
  };
  hints: {
    nextActions: NextActionSuggestion[];
    toolSuggestions: ToolSuggestion[];
    strategicConsiderations: StrategicConsideration[];
    potentialProblems: PotentialProblem[];
  };
  progress?: ProgressTracking;
  debug?: DebugInfo;
}

export interface AgentQueryOptions extends BaseToolOptions {
  service: DatabaseService;
}

/**
 * Calculate detailed metrics from search results
 */
function calculateDetailedMetrics(
  results: VectorSearchResult[],
): DetailedMetrics {
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
 * Enhance semantic analysis with topic clustering
 */
function enhanceSemanticAnalysis(
  query: string,
  results: VectorSearchResult[],
  basicAnalysis: ReturnType<typeof analyzeSemanticCoherence>,
): EnhancedSemanticAnalysis {
  const coverageGaps: string[] = [];

  // Identify coverage gaps based on query keywords not found in results
  const queryWords = query.toLowerCase().split(/\s+/);
  const resultContent = results.map((r) => r.content.toLowerCase()).join(" ");

  for (const word of queryWords) {
    if (word.length > 3 && !resultContent.includes(word)) {
      coverageGaps.push(word);
    }
  }

  // Calculate redundancy (how similar results are to each other)
  let redundancy = 0;
  if (results.length > 1) {
    for (let i = 0; i < results.length - 1; i++) {
      for (let j = i + 1; j < results.length; j++) {
        const content1 = results[i]?.content.toLowerCase() ?? "";
        const content2 = results[j]?.content.toLowerCase() ?? "";
        const words1 = new Set(content1.split(/\s+/));
        const words2 = new Set(content2.split(/\s+/));
        const intersection = new Set([...words1].filter((x) => words2.has(x)));
        const union = new Set([...words1, ...words2]);
        redundancy += intersection.size / union.size;
      }
    }
    redundancy = redundancy / ((results.length * (results.length - 1)) / 2);
  }

  return {
    topicClusters: basicAnalysis.topicClusters.map((cluster, index) => ({
      clusterId: `cluster-${index}`,
      mainTopic: cluster.topic,
      keywords: [cluster.topic], // Simplified for now
      resultIndices: cluster.resultIndices,
      coherenceScore: cluster.confidence,
    })),
    coverageGaps,
    redundancy,
    diversityIndex: basicAnalysis.diversity,
  };
}

/**
 * Analyze query characteristics
 */
function analyzeQuery(query: string): QueryAnalysis {
  const words = query.split(/\s+/);
  const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(query);

  // Determine complexity based on word count and structure
  const complexity =
    words.length <= 3 ? "simple" : words.length <= 7 ? "moderate" : "complex";

  // Calculate specificity (more specific terms = higher specificity)
  const specificTerms = words.filter((w) => w.length > 5 || /[A-Z]/.test(w));
  const specificity = Math.min(
    1,
    specificTerms.length / Math.max(1, words.length),
  );

  // Identify ambiguous parts (very short words, pronouns, etc.)
  const ambiguity = words.filter(
    (w) =>
      w.length <= 2 || ["it", "this", "that", "they"].includes(w.toLowerCase()),
  );

  // Determine query type
  let queryType: "factual" | "exploratory" | "navigational" | "transactional" =
    "exploratory";
  if (/how|what|why|when|where|who/.test(query.toLowerCase())) {
    queryType = "factual";
  } else if (/implement|create|build|make/.test(query.toLowerCase())) {
    queryType = "transactional";
  } else if (/go to|find|locate|search/.test(query.toLowerCase())) {
    queryType = "navigational";
  }

  return {
    complexity,
    specificity,
    ambiguity,
    queryType,
    estimatedIntent: `User wants to ${queryType === "factual" ? "understand" : queryType === "transactional" ? "create" : "find"} information about ${query}`,
    languageDetected: hasJapanese ? "ja" : "en",
  };
}

/**
 * Analyze content characteristics
 */
function analyzeContentCharacteristics(
  results: VectorSearchResult[],
): ContentCharacteristics {
  const contentAnalysis = analyzeContentTypes(results);

  const codeType = contentAnalysis.contentTypes.find((t) => t.type === "code");
  const docType = contentAnalysis.contentTypes.find(
    (t) => t.type === "documentation",
  );
  const exampleType = contentAnalysis.contentTypes.find(
    (t) => t.type === "example",
  );

  const hasCode = (codeType?.count ?? 0) > 0;
  const hasDocs = (docType?.count ?? 0) > 0;
  const hasExamples = (exampleType?.count ?? 0) > 0;

  const predominantType =
    hasCode && hasDocs
      ? "mixed"
      : hasCode
        ? "code"
        : hasDocs
          ? "documentation"
          : hasExamples
            ? "example"
            : "mixed";

  // Detect code languages (simplified)
  const codeLanguages: string[] = [];
  for (const result of results) {
    if (/import .* from|export|const|let|var/.test(result.content)) {
      if (!codeLanguages.includes("javascript"))
        codeLanguages.push("javascript");
    }
    if (/interface|type|enum|namespace/.test(result.content)) {
      if (!codeLanguages.includes("typescript"))
        codeLanguages.push("typescript");
    }
    if (/def |class |import |from |if __name__/.test(result.content)) {
      if (!codeLanguages.includes("python")) codeLanguages.push("python");
    }
  }

  return {
    predominantType,
    codeLanguages: codeLanguages.length > 0 ? codeLanguages : undefined,
    hasExamples,
    hasImplementation: hasCode,
    completeness: Math.min(1, results.length / 10), // Simple completeness metric
  };
}

/**
 * Generate next action suggestions
 */
function generateNextActions(
  query: string,
  results: VectorSearchResult[],
  analysis: AgentQueryResult["analysis"],
  _context?: AgentQueryInput["context"],
): NextActionSuggestion[] {
  const suggestions: NextActionSuggestion[] = [];

  // If no results or very low scores, suggest broadening
  if (results.length === 0 || analysis.metrics.avgScore < 0.3) {
    suggestions.push({
      action: "broaden",
      reasoning: "Current query returned no high-quality results",
      confidence: 0.9,
      suggestedQuery: `${query} OR related OR similar`,
      expectedOutcome: "Find more general matches",
    });
  }

  // If high scores and good coverage, suggest stopping
  if (
    analysis.metrics.avgScore > 0.8 &&
    analysis.semantic.coverageGaps.length === 0
  ) {
    suggestions.push({
      action: "stop",
      reasoning: "Found high-quality results with good coverage",
      confidence: 0.95,
      expectedOutcome: "Current results are sufficient",
    });
  }

  // If coverage gaps exist, suggest refinement
  if (analysis.semantic.coverageGaps.length > 0) {
    suggestions.push({
      action: "refine",
      reasoning: `Missing coverage for: ${analysis.semantic.coverageGaps.join(", ")}`,
      confidence: 0.8,
      suggestedQuery: `${query} ${analysis.semantic.coverageGaps[0]}`,
      expectedOutcome: "Fill in missing information",
    });
  }

  // If too few results, suggest indexing more content
  if (results.length < 3) {
    suggestions.push({
      action: "index_more",
      reasoning: "Limited results available in current index",
      confidence: 0.7,
      expectedOutcome: "Expand available content",
    });
  }

  // If high redundancy, suggest pivoting
  if (analysis.semantic.redundancy > 0.7) {
    suggestions.push({
      action: "pivot",
      reasoning: "Results are too similar, need different perspective",
      confidence: 0.75,
      suggestedQuery: `alternative approach to ${query}`,
      expectedOutcome: "Find diverse viewpoints",
    });
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Generate tool suggestions
 */
function generateToolSuggestions(
  analysis: AgentQueryResult["analysis"],
): ToolSuggestion[] {
  const suggestions: ToolSuggestion[] = [];

  // Suggest hybrid search if diversity is low
  if (analysis.semantic.diversityIndex < 0.3) {
    suggestions.push({
      tool: "gistdex_query",
      purpose: "Use hybrid search for more diverse results",
      priority: "high",
      estimatedValue: 0.8,
      parameters: { hybrid: true },
    });
  }

  // Suggest indexing if results are limited
  if (analysis.metrics.totalResults < 5) {
    suggestions.push({
      tool: "gistdex_index",
      purpose: "Index additional content to expand search space",
      priority: "medium",
      estimatedValue: 0.7,
      parameters: { type: "github" },
    });
  }

  return suggestions;
}

/**
 * Generate strategic considerations
 */
function generateStrategicConsiderations(
  analysis: AgentQueryResult["analysis"],
): StrategicConsideration[] {
  const considerations: StrategicConsideration[] = [];

  if (analysis.queryAnalysis.complexity === "complex") {
    considerations.push({
      consideration: "Complex query may benefit from decomposition",
      importance: "important",
      relatedActions: [
        "Break down into sub-queries",
        "Search for each component",
      ],
    });
  }

  if (
    analysis.contentCharacteristics.predominantType === "code" &&
    !analysis.contentCharacteristics.hasExamples
  ) {
    considerations.push({
      consideration: "Code without examples may be difficult to understand",
      importance: "important",
      relatedActions: ["Search for usage examples", "Look for documentation"],
    });
  }

  return considerations;
}

/**
 * Detect potential problems
 */
function detectPotentialProblems(
  analysis: AgentQueryResult["analysis"],
): PotentialProblem[] {
  const problems: PotentialProblem[] = [];

  if (analysis.metrics.scoreStandardDeviation > 0.3) {
    problems.push({
      problem: "High variance in result quality",
      likelihood: 0.8,
      impact: "medium",
      mitigation: "Focus on high-scoring results or refine query",
    });
  }

  if (analysis.queryAnalysis.ambiguity.length > 0) {
    problems.push({
      problem: "Query contains ambiguous terms",
      likelihood: 0.6,
      impact: "low",
      mitigation: "Clarify ambiguous terms with more specific language",
    });
  }

  return problems;
}

/**
 * Track progress toward goal
 */
function trackProgress(
  _goal: string,
  results: VectorSearchResult[],
  _context?: AgentQueryInput["context"],
): ProgressTracking {
  // Simple progress tracking implementation
  const hasResults = results.length > 0;
  const hasHighQualityResults = results.some((r) => r.score > 0.8);

  const milestones: string[] = [];
  if (hasResults) milestones.push("Found relevant content");
  if (hasHighQualityResults) milestones.push("Identified high-quality matches");

  return {
    goalAlignment: hasHighQualityResults ? 0.8 : hasResults ? 0.5 : 0.2,
    estimatedCompletion: Math.min(1, results.length / 10),
    missingPieces: hasHighQualityResults
      ? []
      : ["High-quality matches for goal"],
    achievedMilestones: milestones,
    suggestedNextMilestone: hasHighQualityResults
      ? "Synthesize findings"
      : "Find better matches",
  };
}

/**
 * Internal handler for agent query operations
 */
async function handleAgentQueryOperation(
  data: AgentQueryInput,
  options: AgentQueryOptions,
): Promise<AgentQueryResult> {
  const { service } = options;
  const startTime = Date.now();

  try {
    // Execute search
    const searchStartTime = Date.now();
    let results: VectorSearchResult[];

    const hybrid = data.options?.hybrid ?? false;
    if (hybrid) {
      results = await hybridSearch(
        data.query,
        {
          k: data.options?.k ?? 5,
          keywordWeight: 0.3,
        },
        service,
      );
    } else {
      results = await semanticSearch(
        data.query,
        {
          k: data.options?.k ?? 5,
        },
        service,
      );
    }

    // Apply reranking if requested
    if (data.options?.rerank !== false) {
      results = rerankResults(data.query, results, { boostFactor: 0.1 });
    }

    // Filter out excluded results if provided
    if (data.context?.excludeResults?.length) {
      results = results.filter(
        (r) => !data.context?.excludeResults?.includes(r.id),
      );
    }

    const searchTime = Date.now() - searchStartTime;

    // Generate comprehensive analysis
    const analysisStartTime = Date.now();

    // Basic metadata generation
    const semanticAnalysis = analyzeSemanticCoherence(results);

    // Create enhanced analysis
    const metrics = calculateDetailedMetrics(results);
    const enhancedSemantic = enhanceSemanticAnalysis(
      data.query,
      results,
      semanticAnalysis,
    );
    const queryAnalysis = analyzeQuery(data.query);
    const contentCharacteristics = analyzeContentCharacteristics(results);

    const analysis: AgentQueryResult["analysis"] = {
      metrics,
      semantic: enhancedSemantic,
      queryAnalysis,
      contentCharacteristics,
    };

    // Generate hints
    const nextActions = generateNextActions(
      data.query,
      results,
      analysis,
      data.context,
    );
    const toolSuggestions = generateToolSuggestions(analysis);
    const strategicConsiderations = generateStrategicConsiderations(analysis);
    const potentialProblems = detectPotentialProblems(analysis);

    const hints: AgentQueryResult["hints"] = {
      nextActions,
      toolSuggestions,
      strategicConsiderations,
      potentialProblems,
    };

    const analysisTime = Date.now() - analysisStartTime;

    // Track progress if goal is provided
    const progress = data.goal
      ? trackProgress(data.goal, results, data.context)
      : undefined;

    // Build response
    const response: Omit<AgentQueryResult, "success" | "message"> = {
      results,
      analysis,
      hints,
      progress,
    };

    // Add debug info if requested
    if (data.options?.includeDebug) {
      response.debug = {
        queryExecutionTime: searchTime,
        embeddingGenerationTime: 0, // TODO: Track this
        vectorSearchTime: searchTime,
        metadataGenerationTime: analysisTime,
        totalProcessingTime: Date.now() - startTime,
        indexStats: {
          totalDocuments: 0, // TODO: Get from service
          totalChunks: 0, // TODO: Get from service
          avgChunkSize: 0, // TODO: Calculate
          lastIndexUpdate: Date.now(),
        },
        searchStrategy: data.options?.hybrid ? "hybrid" : "semantic",
      };
    }

    return createSuccessResponse("Agent query executed successfully", response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // Return empty results on error to satisfy AgentQueryResult type
    return {
      success: false,
      message: `Agent query failed: ${errorMessage}`,
      errors: [errorMessage],
      results: [],
      analysis: {
        metrics: {
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
        },
        semantic: {
          topicClusters: [],
          coverageGaps: [],
          redundancy: 0,
          diversityIndex: 0,
        },
        queryAnalysis: {
          complexity: "simple",
          specificity: 0,
          ambiguity: [],
          queryType: "exploratory",
          estimatedIntent: "Error occurred",
          languageDetected: "en",
        },
        contentCharacteristics: {
          predominantType: "mixed",
          hasExamples: false,
          hasImplementation: false,
          completeness: 0,
        },
      },
      hints: {
        nextActions: [],
        toolSuggestions: [],
        strategicConsiderations: [],
        potentialProblems: [
          {
            problem: errorMessage,
            likelihood: 1,
            impact: "high",
            mitigation: "Fix the error and retry",
          },
        ],
      },
    };
  }
}

/**
 * Public handler for agent query tool
 */
export const handleAgentQueryTool = createToolHandler(
  agentQueryToolSchema,
  handleAgentQueryOperation,
);

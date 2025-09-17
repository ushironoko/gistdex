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
  analyzeContentCharacteristics,
  analyzeSemanticCoherence,
  type ContentCharacteristics,
  extractMainTopics as extractTopics,
} from "../utils/metadata-generator.js";
import {
  calculateDetailedMetrics,
  type DetailedScoreMetrics,
} from "../utils/score-analysis.js";
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
 * Re-exported from score-analysis module
 */
export type DetailedMetrics = DetailedScoreMetrics;

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
 * Re-exported from metadata-generator module
 */
export type { ContentCharacteristics } from "../utils/metadata-generator.js";

/**
 * Next action suggestions for agent
 */
export interface NextActionSuggestion {
  action:
    | "refine"
    | "broaden"
    | "pivot"
    | "stop"
    | "index_more"
    | "write_structured_result";
  reasoning: string;
  confidence: number; // 0-1
  suggestedQuery?: string;
  suggestedTool?: string;
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
 * Summary mode response
 */
export interface SummaryResponse {
  totalResults: number;
  avgScore: number;
  qualityLevel: "high" | "medium" | "low";
  mainTopics: string[];
  coverageStatus: "complete" | "partial" | "insufficient";
}

/**
 * Primary action for summary mode
 */
export interface PrimaryAction {
  action: string;
  reasoning: string;
  confidence: number;
}

/**
 * Recommendation for next steps
 */
export interface Recommendation {
  needsMoreDetail: boolean;
  suggestedMode?: "detailed" | "full" | null;
  shouldStop?: boolean;
}

/**
 * Complete agent query response
 */
export interface AgentQueryResult extends BaseToolResult {
  // Summary mode fields
  summary?: SummaryResponse;
  primaryAction?: PrimaryAction;
  recommendation?: Recommendation;
  estimatedTokens?: number;

  // Detailed/Full mode fields
  results?: VectorSearchResult[];
  analysis?: {
    metrics: DetailedMetrics;
    semantic: EnhancedSemanticAnalysis;
    queryAnalysis: QueryAnalysis;
    contentCharacteristics: ContentCharacteristics;
  };
  hints?: {
    nextActions: NextActionSuggestion[];
    toolSuggestions: ToolSuggestion[];
    strategicConsiderations: StrategicConsideration[];
    potentialProblems: PotentialProblem[];
  };
  progress?: ProgressTracking;
  debug?: DebugInfo;

  // Pagination fields
  nextCursor?: string;
}

export interface AgentQueryOptions extends BaseToolOptions {
  service: DatabaseService;
}

/**
 * Remove embedding arrays from search results to reduce token usage
 */
function removeEmbeddingFromResults(
  results: VectorSearchResult[],
): VectorSearchResult[] {
  return results.map((result) => {
    // Create a new object without the embedding field
    if ("embedding" in result) {
      const { embedding: _embedding, ...rest } =
        result as VectorSearchResult & {
          embedding?: unknown;
        };
      return rest;
    }
    return result;
  });
}

// calculateDetailedMetrics is now imported from score-analysis.ts

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

// analyzeContentCharacteristics is now imported from metadata-generator.ts

/**
 * Generate next action suggestions
 */
function generateNextActions(
  query: string,
  results: VectorSearchResult[],
  analysis: NonNullable<AgentQueryResult["analysis"]>,
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

  // If high scores and good coverage, suggest writing structured result
  if (
    analysis.metrics.avgScore > 0.8 &&
    analysis.semantic.coverageGaps.length === 0
  ) {
    suggestions.push({
      action: "write_structured_result",
      reasoning:
        "Found comprehensive high-quality results. Consider saving your structured analysis using the gistdex_write_structured_result tool",
      confidence: 0.95,
      suggestedTool: "gistdex_write_structured_result",
      expectedOutcome:
        "Create permanent structured knowledge from your findings",
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
  analysis: NonNullable<AgentQueryResult["analysis"]>,
): ToolSuggestion[] {
  const suggestions: ToolSuggestion[] = [];

  // Suggest writing structured results if quality is high
  if (analysis.metrics.avgScore > 0.7 && analysis.metrics.totalResults >= 5) {
    suggestions.push({
      tool: "gistdex_write_structured_result",
      purpose: "Save your comprehensive analysis as structured knowledge",
      priority: "high",
      estimatedValue: 0.9,
      parameters: {
        topic: "Your search topic",
        content: "Your structured analysis in markdown format",
      },
    });
  }

  // Suggest hybrid search if diversity is low
  if (analysis.semantic.diversityIndex < 0.3) {
    suggestions.push({
      tool: "gistdex_query_simple",
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
  analysis: NonNullable<AgentQueryResult["analysis"]>,
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
  analysis: NonNullable<AgentQueryResult["analysis"]>,
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
 * Extract main topics from search results using frequency analysis
 * Delegates to the common metadata-generator utility
 */
function extractMainTopics(
  results: VectorSearchResult[],
  topN: number = 3,
): string[] {
  return extractTopics(results, topN);
}

/**
 * Assess coverage of goal keywords in results
 */
function assessCoverage(
  goal: string,
  results: VectorSearchResult[],
): "complete" | "partial" | "insufficient" {
  // Extract keywords from goal
  const goalKeywords = goal
    .toLowerCase()
    .split(/[\s,;.!?()[\]{}:"']+/)
    .filter((word) => word.length > 3);

  if (goalKeywords.length === 0) return "complete";

  // Check how many goal keywords appear in results
  const resultContent = results.map((r) => r.content.toLowerCase()).join(" ");

  const coveredKeywords = goalKeywords.filter((keyword) =>
    resultContent.includes(keyword),
  );

  const coverageRatio = coveredKeywords.length / goalKeywords.length;

  if (coverageRatio >= 0.8) return "complete";
  if (coverageRatio >= 0.5) return "partial";
  return "insufficient";
}

/**
 * Determine quality level based on average score
 */
function getQualityLevel(avgScore: number): "high" | "medium" | "low" {
  if (avgScore >= 0.7) return "high";
  if (avgScore >= 0.4) return "medium";
  return "low";
}

/**
 * Determine primary action for summary mode
 */
function determinePrimaryAction(
  qualityLevel: "high" | "medium" | "low",
  coverageStatus: "complete" | "partial" | "insufficient",
  resultCount: number,
): PrimaryAction {
  // High quality and complete coverage - stop
  if (qualityLevel === "high" && coverageStatus === "complete") {
    return {
      action: "stop",
      reasoning: "Found high-quality results with complete coverage",
      confidence: 0.95,
    };
  }

  // Low quality - broaden search
  if (qualityLevel === "low") {
    return {
      action: "broaden",
      reasoning: "Current results have low relevance scores",
      confidence: 0.85,
    };
  }

  // Insufficient coverage - refine query
  if (coverageStatus === "insufficient") {
    return {
      action: "refine",
      reasoning: "Missing coverage for key aspects of the goal",
      confidence: 0.8,
    };
  }

  // Few results - need more data
  if (resultCount < 3) {
    return {
      action: "index_more",
      reasoning: "Limited results available in current index",
      confidence: 0.75,
    };
  }

  // Default - continue with detailed mode
  return {
    action: "continue",
    reasoning: "Results are promising but need deeper analysis",
    confidence: 0.7,
  };
}

/**
 * Estimate token count for response (simplified)
 */
function estimateTokenCount(obj: unknown): number {
  // Very rough estimation: 1 token ≈ 4 characters
  const jsonString = JSON.stringify(obj);
  return Math.ceil(jsonString.length / 4);
}

/**
 * Create summary mode response
 */
function createSummaryResponse(
  results: VectorSearchResult[],
  data: AgentQueryInput,
): AgentQueryResult {
  // Calculate basic metrics
  const avgScore =
    results.length > 0
      ? results.reduce((sum, r) => sum + r.score, 0) / results.length
      : 0;

  const qualityLevel = getQualityLevel(avgScore);
  const mainTopics = extractMainTopics(results);
  const coverageStatus = assessCoverage(data.goal, results);

  // Determine primary action
  const primaryAction = determinePrimaryAction(
    qualityLevel,
    coverageStatus,
    results.length,
  );

  // Generate recommendation
  const needsMoreDetail = qualityLevel === "high" && results.length > 0;
  const suggestedMode =
    qualityLevel === "low" ? "detailed" : needsMoreDetail ? "detailed" : null;

  const summary: SummaryResponse = {
    totalResults: results.length,
    avgScore,
    qualityLevel,
    mainTopics,
    coverageStatus,
  };

  const recommendation: Recommendation = {
    needsMoreDetail,
    suggestedMode,
    shouldStop: primaryAction.action === "stop",
  };

  const response: AgentQueryResult = {
    success: true,
    message: "Summary generated successfully",
    summary,
    primaryAction,
    recommendation,
    estimatedTokens: estimateTokenCount({
      summary,
      primaryAction,
      recommendation,
    }),
  };

  return response;
}

/**
 * Create detailed mode response
 */
function createDetailedResponse(
  results: VectorSearchResult[],
  data: AgentQueryInput,
  _service: DatabaseService,
  _searchTime: number,
  _analysisTime: number,
  _startTime: number,
): AgentQueryResult {
  // Use existing analysis generation
  const semanticAnalysis = analyzeSemanticCoherence(results);
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

  // Generate hints (limited for detailed mode)
  const nextActions = generateNextActions(
    data.query,
    results,
    analysis,
    data.context,
  ).slice(0, 2); // Limit to 2 suggestions

  const hints: AgentQueryResult["hints"] = {
    nextActions,
    toolSuggestions: [], // Omit for detailed mode
    strategicConsiderations: [], // Omit for detailed mode
    potentialProblems: [], // Omit for detailed mode
  };

  const cleanedResults = removeEmbeddingFromResults(results.slice(0, 5)); // Limit and clean results

  const response: AgentQueryResult = {
    success: true,
    message: "Detailed results generated",
    results: cleanedResults,
    analysis,
    hints,
    estimatedTokens: estimateTokenCount({
      results: cleanedResults,
      analysis,
      hints,
    }),
  };

  return response;
}

/**
 * Cursor structure for pagination
 */
interface PaginationCursor {
  offset: number;
  query: string;
  goal: string;
}

/**
 * Encode pagination cursor
 */
function encodeCursor(cursor: PaginationCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64");
}

/**
 * Decode pagination cursor
 */
function decodeCursor(cursorString: string): PaginationCursor | null {
  try {
    const decoded = Buffer.from(cursorString, "base64").toString("utf-8");
    const cursor = JSON.parse(decoded) as PaginationCursor;
    // Validate cursor structure
    if (
      typeof cursor.offset !== "number" ||
      typeof cursor.query !== "string" ||
      typeof cursor.goal !== "string"
    ) {
      return null;
    }
    return cursor;
  } catch {
    return null;
  }
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
    // Handle cursor if provided
    let offset = 0;
    if (data.cursor) {
      const cursor = decodeCursor(data.cursor);
      if (!cursor) {
        return {
          success: false,
          message: "Invalid cursor",
          errors: ["Invalid cursor"],
        };
      }
      // Validate cursor matches current query
      if (cursor.query !== data.query || cursor.goal !== data.goal) {
        return {
          success: false,
          message: "Cursor does not match current query context",
          errors: ["Cursor does not match current query context"],
        };
      }
      offset = cursor.offset;
    }

    // Execute search
    const searchStartTime = Date.now();
    let results: VectorSearchResult[];

    // Determine k value - fetch more results to support pagination
    const pageSize = data.options?.pageSize ?? 5;
    const totalK = data.options?.k ?? pageSize * 3; // Fetch more for pagination

    const hybrid = data.options?.hybrid ?? false;
    if (hybrid) {
      results = await hybridSearch(
        data.query,
        {
          k: totalK,
          keywordWeight: 0.3,
        },
        service,
      );
    } else {
      results = await semanticSearch(
        data.query,
        {
          k: totalK,
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

    // Apply pagination
    const paginatedResults = results.slice(offset, offset + pageSize);
    const hasMore = offset + pageSize < results.length;

    const searchTime = Date.now() - searchStartTime;

    // Get response mode (defaults to "summary")
    const mode = data.options?.mode ?? "summary";

    // Handle different modes
    switch (mode) {
      case "summary": {
        const response = createSummaryResponse(paginatedResults, data);

        // Add pagination cursor if there are more results
        if (hasMore) {
          response.nextCursor = encodeCursor({
            offset: offset + pageSize,
            query: data.query,
            goal: data.goal,
          });
        }
        return response;
      }

      case "detailed": {
        const analysisStartTime = Date.now();
        const analysisTime = Date.now() - analysisStartTime;
        const response = createDetailedResponse(
          paginatedResults,
          data,
          service,
          searchTime,
          analysisTime,
          startTime,
        );

        // Add pagination cursor if there are more results
        if (hasMore) {
          response.nextCursor = encodeCursor({
            offset: offset + pageSize,
            query: data.query,
            goal: data.goal,
          });
        }
        return response;
      }

      case "full": {
        // Full mode - existing comprehensive implementation
        const analysisStartTime = Date.now();

        // Remove embeddings to reduce token usage
        const cleanedResults = removeEmbeddingFromResults(paginatedResults);

        // Basic metadata generation (use original for analysis)
        const semanticAnalysis = analyzeSemanticCoherence(paginatedResults);

        // Create enhanced analysis
        const metrics = calculateDetailedMetrics(paginatedResults);
        const enhancedSemantic = enhanceSemanticAnalysis(
          data.query,
          paginatedResults,
          semanticAnalysis,
        );
        const queryAnalysis = analyzeQuery(data.query);
        const contentCharacteristics =
          analyzeContentCharacteristics(paginatedResults);

        const analysis: AgentQueryResult["analysis"] = {
          metrics,
          semantic: enhancedSemantic,
          queryAnalysis,
          contentCharacteristics,
        };

        // Generate hints
        const nextActions = generateNextActions(
          data.query,
          paginatedResults,
          analysis,
          data.context,
        );
        const toolSuggestions = generateToolSuggestions(analysis);
        const strategicConsiderations =
          generateStrategicConsiderations(analysis);
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
          ? trackProgress(data.goal, paginatedResults, data.context)
          : undefined;

        // Build response with cleaned results
        const response: Omit<AgentQueryResult, "success" | "message"> = {
          results: cleanedResults,
          analysis,
          hints,
          progress,
          estimatedTokens: estimateTokenCount({
            results: cleanedResults,
            analysis,
            hints,
            progress,
          }),
        };

        // Add pagination cursor if there are more results
        if (hasMore) {
          response.nextCursor = encodeCursor({
            offset: offset + pageSize,
            query: data.query,
            goal: data.goal,
          });
        }

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

        return createSuccessResponse(
          "Agent query executed successfully",
          response,
        );
      }

      default: {
        // Fallback to summary mode
        const response = createSummaryResponse(paginatedResults, data);
        if (hasMore) {
          response.nextCursor = encodeCursor({
            offset: offset + pageSize,
            query: data.query,
            goal: data.goal,
          });
        }
        return response;
      }
    }
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

// Export for testing
export const handleAgentQuery = handleAgentQueryTool;

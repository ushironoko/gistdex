import { randomUUID } from "node:crypto";
import type { VectorSearchResult } from "../../core/vector-db/adapters/types.js";

// Use VectorSearchResult from the core module for consistency
export type SearchResult = VectorSearchResult;

export interface QueryPlan {
  id: string;
  goal: string;
  stages: PlanStage[];
  evaluationCriteria: EvaluationCriteria;
  status: "pending" | "executing" | "completed" | "failed";
}

export interface PlanStage {
  stageNumber: number;
  description: string;
  query: string;
  expectedResults: ExpectedResult;
  actualResults?: SearchResult[];
  evaluation?: StageEvaluation;
}

export interface ExpectedResult {
  keywords: string[];
  patterns: RegExp[];
  minConfidence: number;
  minMatches: number;
}

export interface EvaluationCriteria {
  minScore: number;
  minMatches: number;
  acceptableConfidence: number;
}

export interface StageEvaluation {
  score: number;
  keywordMatches: number;
  confidence: number;
  feedback: string;
  isSuccessful: boolean;
  suggestions?: string[];
}

export interface QueryPlannerOptions {
  expectedResults?: {
    keywords?: string[];
    minMatches?: number;
    confidence?: number;
    contentPatterns?: string[];
  };
  strategy?: {
    initialMode: "broad" | "specific";
    refinementMethod: "keywords" | "semantic" | "hybrid";
    expansionRules?: string[];
  };
}

export interface ExecutionOptions {
  queryExecutor: (query: string) => Promise<SearchResult[]>;
  maxIterations?: number;
  saveIntermediateResults?: boolean;
  timeout?: number; // Timeout in milliseconds
}

export interface QueryPlanResult {
  planId: string;
  goal: string;
  status: "success" | "partial" | "failed";
  iterations: Array<{
    iterationNumber: number;
    query: string;
    expectedKeywords: string[];
    actualResults: SearchResult[];
    evaluationScore: number;
    feedback: string;
    refinements?: string[];
  }>;
  finalResults: {
    data: SearchResult[];
    confidence: number;
    matchedExpectations?: string[];
    unmatchedExpectations?: string[];
  };
  metadata?: {
    totalIterations: number;
    totalTime?: number;
    cacheHits?: number;
    improvementRate?: number;
  };
}

function extractKeywordsFromGoal(goal: string): string[] {
  const stopWords = new Set([
    // Japanese stop words
    "の",
    "を",
    "に",
    "が",
    "と",
    "は",
    "で",
    "する",
    "いる",
    "ある",
    "こと",
    "もの",
    "これ",
    "それ",
    "あれ",
    "どう",
    "どの",
    "この",
    "その",
    "あの",
    "から",
    "まで",
    "より",
    "ため",
    "なる",
    "れる",
    "られる",
    "せる",
    "させる",
    "できる",
    "理解",
    "知る",
    "分かる",
    // English stop words
    "the",
    "a",
    "an",
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
    "up",
    "about",
    "into",
    "through",
    "during",
    "before",
    "after",
    "above",
    "below",
    "between",
    "under",
    "again",
    "further",
    "then",
    "once",
    "is",
    "am",
    "are",
    "was",
    "were",
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
    "shall",
    "need",
    "dare",
    "ought",
  ]);

  // Improved pattern matching for Japanese and English
  const japanesePattern = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+/g;
  const englishPattern = /[a-zA-Z][a-zA-Z0-9]*/g;
  const camelCasePattern = /[A-Z][a-z]+|[a-z]+/g;

  // Extract Japanese words
  const japaneseWords = (goal.match(japanesePattern) || []).filter(
    (word) => word.length > 1 && !stopWords.has(word),
  );

  // Extract English words (including camelCase splitting)
  let englishWords: string[] = [];
  const englishMatches = goal.match(englishPattern) || [];

  for (const match of englishMatches) {
    // Split camelCase words
    const subWords = match.match(camelCasePattern) || [match];
    englishWords.push(...subWords);
  }

  englishWords = englishWords
    .map((word) => word.toLowerCase())
    .filter((word) => word.length > 2 && !stopWords.has(word));

  // Combine all extracted keywords
  const allWords = [...japaneseWords, ...englishWords];

  // If no keywords found, try to extract meaningful parts
  if (allWords.length === 0) {
    // Remove particles and extract remaining content
    const cleanedGoal = goal
      .replace(/[のをにがとはで]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (cleanedGoal.length > 0) {
      return [cleanedGoal];
    }

    // Ultimate fallback
    return [
      goal
        .toLowerCase()
        .replace(/[^\w\s\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, ""),
    ];
  }

  return [...new Set(allWords)];
}

function generateInitialQuery(
  _goal: string,
  keywords: string[],
  mode: "broad" | "specific",
): string {
  if (mode === "broad") {
    return keywords.slice(0, 2).join(" ");
  }
  return keywords.join(" ");
}

function calculateKeywordMatches(content: string, keywords: string[]): number {
  const lowerContent = content.toLowerCase();
  return keywords.filter((keyword) =>
    lowerContent.includes(keyword.toLowerCase()),
  ).length;
}

function generateFeedback(
  evaluation: Partial<StageEvaluation>,
  expected: ExpectedResult,
): string {
  const parts: string[] = [];

  if (evaluation.keywordMatches !== undefined) {
    const matchRatio = evaluation.keywordMatches / expected.keywords.length;
    if (matchRatio < 0.5) {
      parts.push(
        `Keyword coverage below expected (${evaluation.keywordMatches}/${expected.keywords.length})`,
      );
    }
  }

  if (
    evaluation.confidence !== undefined &&
    evaluation.confidence < expected.minConfidence
  ) {
    parts.push(
      `Confidence below expected (${evaluation.confidence.toFixed(2)} < ${expected.minConfidence})`,
    );
  }

  if (parts.length === 0) {
    parts.push("Results meet expectations");
  }

  return parts.join(". ");
}

export function createQueryPlanner() {
  return {
    generatePlan(goal: string, options?: QueryPlannerOptions): QueryPlan {
      const keywords =
        options?.expectedResults?.keywords || extractKeywordsFromGoal(goal);

      const initialMode = options?.strategy?.initialMode || "broad";
      const initialQuery = generateInitialQuery(goal, keywords, initialMode);

      const patterns = (options?.expectedResults?.contentPatterns || []).map(
        (pattern) => new RegExp(pattern, "i"),
      );

      const plan: QueryPlan = {
        id: randomUUID(),
        goal,
        status: "pending",
        evaluationCriteria: {
          minScore: options?.expectedResults?.confidence || 0.7,
          minMatches: options?.expectedResults?.minMatches || 3,
          acceptableConfidence: options?.expectedResults?.confidence || 0.7,
        },
        stages: [
          {
            stageNumber: 0,
            description: "Initial search",
            query: initialQuery,
            expectedResults: {
              keywords,
              patterns,
              minConfidence: options?.expectedResults?.confidence || 0.7,
              minMatches: options?.expectedResults?.minMatches || 3,
            },
          },
        ],
      };

      return plan;
    },

    evaluateStage(
      stage: PlanStage,
      actualResults: SearchResult[],
    ): StageEvaluation {
      if (!actualResults || actualResults.length === 0) {
        return {
          score: 0,
          keywordMatches: 0,
          confidence: 0,
          feedback: "No results found",
          isSuccessful: false,
          suggestions: ["Try broader search terms", "Check spelling"],
        };
      }

      let totalKeywordMatches = 0;
      let totalConfidence = 0;

      for (const result of actualResults) {
        const content = result.content || "";
        const keywordMatches = calculateKeywordMatches(
          content,
          stage.expectedResults.keywords,
        );
        totalKeywordMatches += keywordMatches;
        totalConfidence += result.score || 0;
      }

      const avgKeywordMatches = totalKeywordMatches / actualResults.length;
      const avgConfidence = totalConfidence / actualResults.length;

      const matchRatio =
        avgKeywordMatches / stage.expectedResults.keywords.length;
      const score = matchRatio * 0.6 + avgConfidence * 0.4;

      const isSuccessful =
        actualResults.length >= stage.expectedResults.minMatches &&
        avgConfidence >= stage.expectedResults.minConfidence;

      const evaluation: StageEvaluation = {
        score,
        keywordMatches: avgKeywordMatches,
        confidence: avgConfidence,
        feedback: generateFeedback(
          { keywordMatches: avgKeywordMatches, confidence: avgConfidence },
          stage.expectedResults,
        ),
        isSuccessful,
      };

      if (!isSuccessful) {
        evaluation.suggestions = [];
        if (avgKeywordMatches < stage.expectedResults.keywords.length / 2) {
          evaluation.suggestions.push("add more specific keywords");
        }
        if (actualResults.length < stage.expectedResults.minMatches) {
          evaluation.suggestions.push("broaden search criteria");
        }
      }

      return evaluation;
    },

    refineQuery(
      query: string,
      evaluation: StageEvaluation,
      method: "keywords" | "semantic" | "hybrid" = "hybrid",
    ): string {
      let refinedQuery = query;

      if (method === "keywords") {
        if (evaluation.suggestions?.includes("add more specific keywords")) {
          refinedQuery = `${query} configuration setup`;
        } else if (
          evaluation.suggestions?.includes("broaden search criteria")
        ) {
          const terms = query.split(" ");
          if (terms.length > 2) {
            refinedQuery = terms.slice(0, 2).join(" ");
          }
        } else {
          refinedQuery = `${query} implementation`;
        }
      } else if (method === "semantic") {
        if (evaluation.score < 0.5) {
          refinedQuery = `${query} documentation guide tutorial`;
        } else {
          refinedQuery = `${query} examples usage`;
        }
      } else if (method === "hybrid") {
        const parts = [query];
        if (evaluation.suggestions?.includes("add more specific keywords")) {
          parts.push("configuration setup");
        }
        if (evaluation.score < 0.5) {
          parts.push("documentation guide");
        }
        refinedQuery = [...new Set(parts)].join(" ");
      }

      return refinedQuery;
    },

    /**
     * Execute a single stage of the plan (for agent-driven execution)
     * This is the main method for Agent in the Loop architecture
     */
    async executeSingleStage(
      plan: QueryPlan,
      stageIndex: number,
      queryExecutor: (query: string) => Promise<SearchResult[]>,
      options?: { timeout?: number },
    ): Promise<{
      stage: PlanStage;
      results: SearchResult[];
      evaluation: StageEvaluation;
      shouldContinue: boolean;
      nextQuery?: string;
      timedOut?: boolean;
    }> {
      const stage = plan.stages[stageIndex];
      if (!stage) {
        throw new Error(`Stage ${stageIndex} not found in plan`);
      }

      // Execute query with timeout
      let results: SearchResult[] = [];
      let timedOut = false;

      try {
        if (options?.timeout) {
          // Create a timeout promise
          const timeoutPromise = new Promise<SearchResult[]>((_, reject) => {
            setTimeout(
              () => reject(new Error("Query execution timed out")),
              options.timeout,
            );
          });

          // Race between query execution and timeout
          results = await Promise.race([
            queryExecutor(stage.query),
            timeoutPromise,
          ]);
        } else {
          results = await queryExecutor(stage.query);
        }
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "Query execution timed out"
        ) {
          console.warn(`Query execution timed out for stage ${stageIndex}`);
          timedOut = true;
        } else {
          console.error(
            `Query execution failed for stage ${stageIndex}:`,
            error,
          );
        }
        results = [];
      }

      // Evaluate results
      const evaluation = this.evaluateStage(stage, results);
      stage.actualResults = results;
      stage.evaluation = evaluation;

      // Determine if we should continue
      const shouldContinue =
        !evaluation.isSuccessful && stageIndex < plan.stages.length - 1;

      // Generate next query if needed
      let nextQuery: string | undefined;
      if (shouldContinue && !evaluation.isSuccessful) {
        nextQuery = this.refineQuery(stage.query, evaluation, "hybrid");
      }

      return {
        stage,
        results,
        evaluation,
        shouldContinue,
        nextQuery,
        timedOut,
      };
    },
  };
}

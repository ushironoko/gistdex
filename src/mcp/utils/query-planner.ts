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
    "の",
    "を",
    "に",
    "が",
    "と",
    "は",
    "で",
    "する",
    "理解",
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
  ]);

  // 日本語と英語を分離して処理
  const japanesePattern = /[ぁ-んァ-ヶー一-龯]+/g;
  const englishPattern = /[a-zA-Z]+/g;

  const japaneseWords = (goal.match(japanesePattern) || []).filter(
    (word) => word.length > 1 && !stopWords.has(word),
  );

  const englishWords = (goal.toLowerCase().match(englishPattern) || []).filter(
    (word) => word.length > 2 && !stopWords.has(word),
  );

  const allWords = [...japaneseWords, ...englishWords];

  // VitePressの設定方法を理解する -> vitepress, 設定, 方法
  if (allWords.length === 0) {
    // フォールバック: 全体を1つのキーワードとして扱う
    return [goal.toLowerCase().replace(/[^\w\sぁ-んァ-ヶー一-龯]/g, "")];
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

    async executePlan(
      plan: QueryPlan,
      options: ExecutionOptions,
    ): Promise<QueryPlanResult> {
      const maxIterations = options.maxIterations || 5;
      const iterations: QueryPlanResult["iterations"] = [];
      let bestResults: SearchResult[] = [];
      let bestScore = 0;

      plan.status = "executing";

      for (let i = 0; i < maxIterations; i++) {
        const currentStage = plan.stages[plan.stages.length - 1];
        if (!currentStage) {
          break;
        }

        let results: SearchResult[] = [];
        try {
          results = await options.queryExecutor(currentStage.query);
        } catch (error) {
          console.error(`Query execution failed for iteration ${i}:`, error);
          // Continue with empty results on error
          results = [];
        }

        const evaluation = this.evaluateStage(currentStage, results);
        currentStage.actualResults = results;
        currentStage.evaluation = evaluation;

        iterations.push({
          iterationNumber: i,
          query: currentStage.query,
          expectedKeywords: currentStage.expectedResults.keywords,
          actualResults: results,
          evaluationScore: evaluation.score,
          feedback: evaluation.feedback,
          refinements: evaluation.suggestions,
        });

        if (evaluation.score > bestScore) {
          bestScore = evaluation.score;
          bestResults = results;
        }

        if (evaluation.isSuccessful) {
          plan.status = "completed";
          break;
        }

        if (i < maxIterations - 1) {
          const refinedQuery = this.refineQuery(
            currentStage.query,
            evaluation,
            "hybrid",
          );

          plan.stages.push({
            stageNumber: i + 1,
            description: `Refined search iteration ${i + 1}`,
            query: refinedQuery,
            expectedResults: currentStage.expectedResults,
          });
        }
      }

      const finalStatus =
        bestScore >= plan.evaluationCriteria.minScore
          ? "success"
          : bestScore > 0.3
            ? "partial"
            : "failed";

      return {
        planId: plan.id,
        goal: plan.goal,
        status: finalStatus,
        iterations,
        finalResults: {
          data: bestResults,
          confidence: bestScore,
        },
      };
    },
  };
}

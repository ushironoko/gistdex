/**
 * Evaluate search results against a goal
 * Returns feedback for agent to decide next action
 */

import { z } from "zod";
import type { VectorSearchResult } from "../../core/vector-db/adapters/types.js";
import { saveEvaluationToCache } from "../utils/agent-cache.js";
import { createToolHandler } from "../utils/tool-handler.js";

// Schema for evaluate tool
export const evaluateToolSchema = z.object({
  goal: z.string().describe("The ultimate goal to achieve"),
  query: z.string().describe("The query that was used"),
  results: z
    .array(
      z.object({
        content: z.string(),
        score: z.number(),
        metadata: z.record(z.unknown()).optional(),
      }),
    )
    .describe("Search results to evaluate"),
  iteration: z
    .number()
    .optional()
    .default(1)
    .describe("Current iteration number"),
  previousScore: z
    .number()
    .optional()
    .describe("Score from previous iteration"),
});

export type EvaluateToolInput = {
  goal: string;
  query: string;
  results: Array<{
    content: string;
    score: number;
    metadata?: Record<string, unknown>;
  }>;
  iteration?: number;
  previousScore?: number;
};

/**
 * Analyze results and provide structured feedback
 */
function analyzeResults(
  goal: string,
  results: VectorSearchResult[],
): {
  coverage: number;
  relevance: number;
  confidence: number;
  missingAspects: string[];
  foundAspects: string[];
} {
  // Extract keywords from goal (improved for Japanese)
  const japanesePattern = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+/g;
  const englishPattern = /[a-zA-Z][a-zA-Z0-9]*/g;

  const japaneseKeywords = (goal.match(japanesePattern) || []).filter(
    (word) => word.length > 1,
  );
  const englishKeywords = (
    goal.toLowerCase().match(englishPattern) || []
  ).filter((word) => word.length > 2);

  const goalKeywords = [...japaneseKeywords, ...englishKeywords];

  // Analyze content coverage
  const allContent = results
    .map((r) => r.content)
    .join(" ")
    .toLowerCase();
  const foundKeywords = goalKeywords.filter((kw) => allContent.includes(kw));
  const coverage =
    goalKeywords.length > 0 ? foundKeywords.length / goalKeywords.length : 0;

  // Calculate average relevance from scores
  const relevance =
    results.length > 0
      ? results.reduce((sum, r) => sum + r.score, 0) / results.length
      : 0;

  // Determine confidence based on multiple factors
  const hasHighScoreResults = results.some((r) => r.score > 0.8);
  const hasMultipleResults = results.length >= 3;
  const confidence =
    coverage * 0.4 +
    relevance * 0.4 +
    (hasHighScoreResults ? 0.1 : 0) +
    (hasMultipleResults ? 0.1 : 0);

  // Identify what's missing and what's found
  const missingAspects: string[] = [];
  const foundAspects: string[] = [];

  // Check for common information needs (bilingual support)
  const lowerGoal = goal.toLowerCase();

  // How-to patterns
  if (
    (lowerGoal.includes("how") ||
      goal.includes("方法") ||
      goal.includes("やり方")) &&
    !allContent.includes("step") &&
    !allContent.includes("ステップ") &&
    !allContent.includes("手順")
  ) {
    missingAspects.push("step-by-step instructions / 手順");
  } else if (lowerGoal.includes("how") || goal.includes("方法")) {
    foundAspects.push("instructions / 手順");
  }

  // Configuration patterns
  if (
    (lowerGoal.includes("config") ||
      goal.includes("設定") ||
      goal.includes("コンフィグ")) &&
    !allContent.includes("configuration") &&
    !allContent.includes("設定") &&
    !allContent.includes("コンフィグ")
  ) {
    missingAspects.push("configuration details / 設定詳細");
  } else if (lowerGoal.includes("config") || goal.includes("設定")) {
    foundAspects.push("configuration / 設定");
  }

  // Example patterns
  if (
    (lowerGoal.includes("example") ||
      goal.includes("例") ||
      goal.includes("サンプル")) &&
    !allContent.includes("example") &&
    !allContent.includes("例")
  ) {
    missingAspects.push("concrete examples / 具体例");
  } else if (lowerGoal.includes("example") || goal.includes("例")) {
    foundAspects.push("examples / 例");
  }

  // Implementation patterns
  if (
    (lowerGoal.includes("implement") ||
      goal.includes("実装") ||
      goal.includes("作成")) &&
    !allContent.includes("implementation") &&
    !allContent.includes("実装")
  ) {
    missingAspects.push("implementation details / 実装詳細");
  } else if (lowerGoal.includes("implement") || goal.includes("実装")) {
    foundAspects.push("implementation / 実装");
  }

  // Understanding patterns
  if (
    (lowerGoal.includes("understand") ||
      goal.includes("理解") ||
      goal.includes("把握")) &&
    !allContent.includes("explanation") &&
    !allContent.includes("説明")
  ) {
    missingAspects.push("detailed explanation / 詳細説明");
  } else if (lowerGoal.includes("understand") || goal.includes("理解")) {
    foundAspects.push("explanation / 説明");
  }

  // Add found keywords as aspects
  foundKeywords.forEach((kw) => {
    if (!foundAspects.includes(kw)) {
      foundAspects.push(kw);
    }
  });

  // Add missing keywords as aspects
  goalKeywords
    .filter((kw) => !foundKeywords.includes(kw))
    .forEach((kw) => {
      if (!missingAspects.some((aspect) => aspect.includes(kw))) {
        missingAspects.push(`information about ${kw}`);
      }
    });

  return {
    coverage,
    relevance,
    confidence,
    missingAspects,
    foundAspects,
  };
}

/**
 * Generate agent guidance based on evaluation
 */
function generateAgentGuidance(
  confidence: number,
  missingAspects: string[],
  iteration: number,
  previousScore?: number,
): {
  shouldContinue: boolean;
  suggestedAction: string;
  reasoning: string;
} {
  const isImproving = previousScore ? confidence > previousScore : true;
  const isHighConfidence = confidence > 0.75;
  const isStagnant =
    previousScore && Math.abs(confidence - previousScore) < 0.05;
  const tooManyIterations = iteration >= 5;

  if (isHighConfidence) {
    return {
      shouldContinue: false,
      suggestedAction:
        "Goal achieved. Use the results to answer the user's request.",
      reasoning: `High confidence (${(confidence * 100).toFixed(1)}%) indicates goal is met.`,
    };
  }

  if (tooManyIterations && !isImproving) {
    return {
      shouldContinue: false,
      suggestedAction: "Stop iteration. Use best available results.",
      reasoning: `After ${iteration} iterations without improvement, continuing is unlikely to help.`,
    };
  }

  if (isStagnant) {
    return {
      shouldContinue: true,
      suggestedAction: "Try a significantly different query approach.",
      reasoning: "Results are not improving. A new strategy is needed.",
    };
  }

  if (missingAspects.length > 0) {
    return {
      shouldContinue: true,
      suggestedAction: `Refine query to find: ${missingAspects.slice(0, 3).join(", ")}`,
      reasoning: `Missing important information. Confidence: ${(confidence * 100).toFixed(1)}%`,
    };
  }

  return {
    shouldContinue: true,
    suggestedAction: "Broaden the search with related terms.",
    reasoning: `Low confidence (${(confidence * 100).toFixed(1)}%) suggests need for more results.`,
  };
}

export const handleEvaluateTool = createToolHandler(
  evaluateToolSchema,
  async (data: EvaluateToolInput, _options?: unknown) => {
    const { goal, query, results, iteration = 1, previousScore } = data;

    // Analyze the results
    const analysis = analyzeResults(goal, results as VectorSearchResult[]);

    // Generate guidance for the agent
    const guidance = generateAgentGuidance(
      analysis.confidence,
      analysis.missingAspects,
      iteration,
      previousScore,
    );

    // Save evaluation to cache for future reference
    let cacheStatus = "unknown";
    let cacheError: string | undefined;
    try {
      await saveEvaluationToCache({
        goal,
        query,
        confidence: analysis.confidence,
        coverage: analysis.coverage,
        relevance: analysis.relevance,
        foundAspects: analysis.foundAspects,
        missingAspects: analysis.missingAspects,
        shouldContinue: guidance.shouldContinue,
        iteration,
      });
      cacheStatus = "saved";
    } catch (error) {
      // Log error but don't fail the evaluation
      console.error("Failed to save evaluation to cache:", error);
      cacheStatus = "failed";
      cacheError = error instanceof Error ? error.message : String(error);
    }

    // Return structured feedback for agent
    return {
      success: true,
      // Core evaluation metrics
      evaluation: {
        confidence: analysis.confidence,
        coverage: analysis.coverage,
        relevance: analysis.relevance,
        iteration,
      },

      // What was found and what's missing
      content: {
        foundAspects: analysis.foundAspects,
        missingAspects: analysis.missingAspects,
        resultCount: results.length,
        highScoreCount: results.filter((r) => r.score > 0.8).length,
      },

      // Agent guidance
      agentGuidance: {
        shouldContinue: guidance.shouldContinue,
        suggestedAction: guidance.suggestedAction,
        reasoning: guidance.reasoning,
        nextTool: guidance.shouldContinue ? "gistdex_refine_query" : null,
      },

      // Progress tracking
      progress: {
        isImproving: previousScore ? analysis.confidence > previousScore : true,
        improvementRate: previousScore
          ? `${(
              ((analysis.confidence - previousScore) / previousScore) * 100
            ).toFixed(1)}%`
          : "N/A",
        currentScore: analysis.confidence,
        previousScore: previousScore || 0,
      },

      // Cache status (for debugging)
      _cacheDebug: {
        status: cacheStatus,
        error: cacheError,
      },

      // Human-readable summary
      summary: `📊 Evaluation Results (Iteration ${iteration}):

🎯 Goal: "${goal}"
🔍 Query used: "${query}"
📈 Confidence: ${(analysis.confidence * 100).toFixed(1)}%
📊 Coverage: ${(analysis.coverage * 100).toFixed(1)}%
⭐ Relevance: ${(analysis.relevance * 100).toFixed(1)}%

✅ Found: ${analysis.foundAspects.join(", ") || "No specific aspects identified"}
❌ Missing: ${analysis.missingAspects.join(", ") || "All aspects covered"}

💡 ${guidance.reasoning}
➡️ Recommendation: ${guidance.suggestedAction}`,
    };
  },
);

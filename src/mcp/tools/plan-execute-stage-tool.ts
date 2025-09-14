import { z } from "zod";
import type { DatabaseService } from "../../core/database/database-service.js";
import { hybridSearch, semanticSearch } from "../../core/search/search.js";
import type { VectorSearchResult } from "../../core/vector-db/adapters/types.js";
import { saveStageToCache } from "../utils/agent-cache.js";
import {
  createQueryPlanner,
  type StageEvaluation,
} from "../utils/query-planner.js";
import { createToolHandler } from "../utils/tool-handler.js";

// Schema for the plan execute stage tool
const planExecuteStageSchema = z.object({
  planId: z.string().describe("The ID of the plan to execute"),
  stageIndex: z
    .number()
    .int()
    .min(0)
    .describe("The index of the stage to execute"),
  plan: z
    .object({
      id: z.string(),
      goal: z.string(),
      status: z.enum(["pending", "executing", "completed", "failed"]),
      evaluationCriteria: z.object({
        minScore: z.number(),
        minMatches: z.number(),
        acceptableConfidence: z.number(),
      }),
      stages: z.array(
        z.object({
          stageNumber: z.number(),
          description: z.string(),
          query: z.string(),
          expectedResults: z.object({
            keywords: z.array(z.string()),
            patterns: z.array(z.unknown()),
            minConfidence: z.number(),
            minMatches: z.number(),
          }),
          actualResults: z.array(z.unknown()).optional(),
          evaluation: z.unknown().optional(),
        }),
      ),
    })
    .describe("The complete plan object"),
  queryOptions: z
    .object({
      k: z.number().default(5),
      hybrid: z.boolean().default(false),
      rerank: z.boolean().default(true),
    })
    .optional()
    .default({ k: 5, hybrid: false, rerank: true })
    .describe("Options for query execution"),
});

type PlanExecuteStageInput = {
  planId: string;
  stageIndex: number;
  plan: {
    id: string;
    goal: string;
    status: "pending" | "executing" | "completed" | "failed";
    evaluationCriteria: {
      minScore: number;
      minMatches: number;
      acceptableConfidence: number;
    };
    stages: Array<{
      stageNumber: number;
      description: string;
      query: string;
      expectedResults: {
        keywords: string[];
        patterns: unknown[];
        minConfidence: number;
        minMatches: number;
      };
      actualResults?: unknown[];
      evaluation?: unknown;
    }>;
  };
  queryOptions?: {
    k?: number;
    hybrid?: boolean;
    rerank?: boolean;
  };
};

/**
 * Execute a single stage of a query plan
 * This allows agents to control the execution flow
 */
export const handlePlanExecuteStage = createToolHandler(
  planExecuteStageSchema,
  async (
    data: PlanExecuteStageInput,
    options?: { service?: DatabaseService },
  ) => {
    const { planId, stageIndex, plan, queryOptions } = data;
    const dbService = options?.service;

    if (!dbService) {
      return {
        success: false,
        error: "Database service not available",
      };
    }

    try {
      // Create planner instance
      const planner = createQueryPlanner();

      // Create query executor
      const queryExecutor = async (query: string) => {
        const { k = 5, hybrid = false, rerank = true } = queryOptions || {};

        let results: VectorSearchResult[];
        if (hybrid) {
          results = await hybridSearch(
            query,
            {
              k,
              rerank,
              rerankBoostFactor: 0.1,
              keywordWeight: 0.3,
            },
            dbService,
          );
        } else {
          results = await semanticSearch(query, { k, rerank }, dbService);
        }

        // Return VectorSearchResult directly
        return results;
      };

      // Convert patterns from unknown[] to RegExp[] and handle actualResults
      const convertedPlan = {
        ...plan,
        stages: plan.stages.map((stage) => ({
          ...stage,
          expectedResults: {
            ...stage.expectedResults,
            patterns: (stage.expectedResults.patterns as unknown[]).map((p) => {
              if (typeof p === "string") {
                return new RegExp(p);
              }
              if (p instanceof RegExp) {
                return p;
              }
              // If it's an object with source and flags, recreate the RegExp
              const patternObj = p as { source?: string; flags?: string };
              if (patternObj.source) {
                return new RegExp(patternObj.source, patternObj.flags || "");
              }
              // Default to empty pattern
              return new RegExp("");
            }),
          },
          // Safely convert actualResults - they should be VectorSearchResult[] or undefined
          actualResults: stage.actualResults as
            | VectorSearchResult[]
            | undefined,
          // Convert evaluation to StageEvaluation type or undefined
          evaluation: stage.evaluation as StageEvaluation | undefined,
        })),
      };

      // Execute the single stage with optional timeout (30 seconds default)
      const stageResult = await planner.executeSingleStage(
        convertedPlan,
        stageIndex,
        queryExecutor,
        { timeout: 30000 }, // 30 seconds timeout
      );

      // Save stage execution to cache
      try {
        await saveStageToCache({
          planId,
          stageIndex,
          goal: plan.goal,
          query: stageResult.stage.query,
          resultsCount: stageResult.results.length,
          evaluation: {
            score: stageResult.evaluation.score,
            isSuccessful: stageResult.evaluation.isSuccessful,
            feedback: stageResult.evaluation.feedback,
          },
          shouldContinue: stageResult.shouldContinue,
        });
      } catch (error) {
        // Log error but don't fail the stage execution
        console.error("Failed to save stage to cache:", error);
      }

      return {
        success: true,
        result: {
          planId,
          stageIndex,
          stage: stageResult.stage,
          results: stageResult.results,
          evaluation: stageResult.evaluation,
          shouldContinue: stageResult.shouldContinue,
          nextQuery: stageResult.nextQuery,
          agentGuidance: {
            // Provide clear guidance for the agent
            nextAction: stageResult.timedOut
              ? "Query timed out. Consider simplifying the query or breaking it into smaller parts."
              : stageResult.shouldContinue
                ? "Use gistdex_refine_query to improve the query based on evaluation feedback"
                : stageResult.evaluation.isSuccessful
                  ? "Results are satisfactory. Consider using the results or ending the search."
                  : "Maximum iterations reached or no improvement possible.",
            suggestedTools: stageResult.shouldContinue
              ? ["gistdex_refine_query", "gistdex_evaluate"]
              : ["gistdex_query"],
            evaluationSummary: {
              score: stageResult.evaluation.score,
              isSuccessful: stageResult.evaluation.isSuccessful,
              feedback: stageResult.evaluation.feedback,
              suggestions: stageResult.evaluation.suggestions,
              timedOut: stageResult.timedOut || false,
            },
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
);

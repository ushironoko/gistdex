import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DatabaseService } from "../../core/database/database-service.js";
import { hybridSearch, semanticSearch } from "../../core/search/search.js";
import type { VectorSearchResult } from "../../core/vector-db/adapters/types.js";

import {
  type QueryPlanToolInput,
  queryPlanToolSchema,
} from "../schemas/validation.js";
import type { QueryPlanResult } from "../utils/query-planner.js";
import { createQueryPlanner } from "../utils/query-planner.js";
import { createToolHandler } from "../utils/tool-handler.js";

async function executeQuery(
  dbService: DatabaseService | null,
  query: string,
  options?: {
    k?: number;
    hybrid?: boolean;
    rerank?: boolean;
  },
): Promise<VectorSearchResult[]> {
  if (!dbService) {
    console.log("No database service provided, returning empty results");
    return [];
  }

  const { k = 5, hybrid = false, rerank = true } = options || {};

  try {
    console.log(`Executing query: "${query}" with options:`, {
      k,
      hybrid,
      rerank,
    });

    if (hybrid) {
      // Use hybrid search for non-strict evaluation modes
      const results = await hybridSearch(
        query,
        {
          k,
          rerank,
          rerankBoostFactor: 0.1,
          keywordWeight: 0.3,
        },
        dbService,
      );
      console.log(`Hybrid search returned ${results?.length ?? 0} results`);
      return results ?? [];
    } else {
      // Use semantic search for strict evaluation mode
      const results = await semanticSearch(
        query,
        {
          k,
          rerank,
          rerankBoostFactor: 0.1,
        },
        dbService,
      );
      console.log(`Semantic search returned ${results?.length ?? 0} results`);
      return results ?? [];
    }
  } catch (error) {
    // Log error but return empty results to allow the planner to continue
    console.error("Query execution failed:", error);
    return [];
  }
}

function getCacheDirectory(): string {
  const baseDir = process.env.GISTDEX_CACHE_DIR || ".gistdex";
  return join(baseDir, "cache", "plans");
}

async function savePlanResults(
  planResult: QueryPlanResult,
  cacheDir: string,
): Promise<string> {
  const planPath = join(cacheDir, `${planResult.planId}.json`);

  // Ensure directory exists
  mkdirSync(dirname(planPath), { recursive: true });

  // Save plan results
  writeFileSync(planPath, JSON.stringify(planResult, null, 2), "utf-8");

  return planPath;
}

async function saveStructuredKnowledge(
  goal: string,
  results: VectorSearchResult[],
  cacheDir: string,
): Promise<string> {
  const knowledgeDir = join(dirname(cacheDir), "knowledge");
  mkdirSync(knowledgeDir, { recursive: true });

  // Generate a filename from the goal
  const filename = `${goal
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 50)}.md`;
  const knowledgePath = join(knowledgeDir, filename);

  // Format results as structured markdown
  const content = [
    `# ${goal}`,
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Results",
    "",
    ...results.map((result, i) => {
      const metadata = result.metadata || {};
      const source = metadata.sourceType || "unknown";
      const path = metadata.path || metadata.url || "";

      return [
        `### Result ${i + 1}`,
        "",
        `- **Source**: ${source}`,
        path ? `- **Path**: ${path}` : "",
        `- **Score**: ${result.score.toFixed(3)}`,
        "",
        "```",
        result.content,
        "```",
        "",
      ]
        .filter(Boolean)
        .join("\n");
    }),
  ].join("\n");

  writeFileSync(knowledgePath, content, "utf-8");

  return knowledgePath;
}

export const handleQueryPlanTool = createToolHandler(
  queryPlanToolSchema,
  async (data: QueryPlanToolInput, options?: { service?: DatabaseService }) => {
    const {
      goal,
      maxIterations = 5,
      saveIntermediateResults = true,
      timeoutSeconds = 120,
    } = data;

    // Use provided database service or null (for backward compatibility)
    const dbService = options?.service || null;

    try {
      // Initialize planner
      const planner = createQueryPlanner();

      // Generate plan
      const plan = planner.generatePlan(goal, {
        expectedResults: data.expectedResults,
        strategy: data.strategy
          ? {
              initialMode: data.strategy.initialMode || "broad",
              refinementMethod: data.strategy.refinementMethod || "hybrid",
              expansionRules: data.strategy.expansionRules,
            }
          : undefined,
      });

      // Create query executor
      const queryExecutor = async (query: string) => {
        return executeQuery(dbService, query, {
          k: data.expectedResults?.minMatches || 5,
          hybrid: data.evaluationMode !== "strict",
          rerank: true,
        });
      };

      // Note: This tool uses the old automatic execution approach.
      // For Agent in the Loop, use gistdex_plan_execute_stage instead.

      // Execute plan stages manually with timeout support
      let bestResults: VectorSearchResult[] = [];
      let bestScore = 0;
      const iterations: QueryPlanResult["iterations"] = [];
      let isTimeout = false;

      const startTime = Date.now();
      const timeoutMs = timeoutSeconds * 1000;

      for (let i = 0; i < maxIterations; i++) {
        // Check timeout
        if (Date.now() - startTime > timeoutMs) {
          isTimeout = true;
          console.log(`Query plan timed out after ${timeoutSeconds} seconds`);
          break;
        }

        const currentStage = plan.stages[plan.stages.length - 1];
        if (!currentStage) break;

        // Execute query
        let results: VectorSearchResult[] = [];
        try {
          results = await queryExecutor(currentStage.query);
        } catch (error) {
          console.error(`Query execution failed for iteration ${i}:`, error);
        }

        // Evaluate results
        const evaluation = planner.evaluateStage(currentStage, results);
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

        // Refine query for next iteration
        if (i < maxIterations - 1) {
          const refinedQuery = planner.refineQuery(
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

      const planResult: QueryPlanResult = {
        planId: plan.id,
        goal,
        status: finalStatus,
        iterations,
        finalResults: {
          data: bestResults,
          confidence: bestScore,
          unmatchedExpectations: isTimeout
            ? ["Query timed out before completion"]
            : undefined,
        },
        metadata: {
          totalIterations: iterations.length,
          totalTime: Date.now() - startTime,
        },
      };

      // Save results if successful
      let savedPlanPath: string | undefined;
      let structuredKnowledgePath: string | undefined;

      if (planResult.status !== "failed") {
        const cacheDir = getCacheDirectory();

        if (saveIntermediateResults) {
          savedPlanPath = await savePlanResults(planResult, cacheDir);
        }

        if (planResult.finalResults.data.length > 0) {
          structuredKnowledgePath = await saveStructuredKnowledge(
            goal,
            planResult.finalResults.data,
            cacheDir,
          );
        }
      }

      // Return formatted result
      return {
        success: true,
        result: {
          ...planResult,
          savedAt: savedPlanPath,
          structuredKnowledgePath,
          summary: `Query plan ${planResult.status} after ${planResult.iterations.length} iterations with confidence ${planResult.finalResults.confidence.toFixed(2)}`,
        },
      };
    } finally {
      // Cleanup (nothing to clean up for mock)
    }
  },
);

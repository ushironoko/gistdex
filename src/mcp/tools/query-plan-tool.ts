import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
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
      console.log(`Hybrid search returned ${results.length} results`);
      return results;
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
      console.log(`Semantic search returned ${results.length} results`);
      return results;
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

      // Execute plan with timeout
      let planResult: QueryPlanResult;
      let isTimeout = false;

      // Store intermediate results that can be accessed if timeout occurs
      let intermediateResults: QueryPlanResult | null = null;

      const executionPromise = planner
        .executePlan(plan, {
          queryExecutor,
          maxIterations,
          saveIntermediateResults: saveIntermediateResults === true,
        })
        .then((result) => {
          intermediateResults = result;
          return result;
        });

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise<QueryPlanResult>((resolve) => {
        setTimeout(() => {
          isTimeout = true;
          // Return partial results on timeout
          const partialResult: QueryPlanResult = intermediateResults || {
            planId: plan.id,
            goal,
            status: "partial",
            iterations: [],
            finalResults: {
              data: [],
              confidence: 0,
              unmatchedExpectations: ["Query timed out before completion"],
            },
            metadata: {
              totalIterations: 0,
              totalTime: timeoutSeconds * 1000,
            },
          };
          resolve(partialResult);
        }, timeoutSeconds * 1000); // Convert seconds to milliseconds
      });

      planResult = await Promise.race([executionPromise, timeoutPromise]);

      // Log if timeout occurred
      if (isTimeout) {
        console.log(
          `Query plan timed out after ${timeoutSeconds} seconds, returning partial results`,
        );
      }

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

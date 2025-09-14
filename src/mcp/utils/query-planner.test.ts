import { beforeEach, describe, expect, it } from "vitest";
import type {
  PlanStage,
  QueryPlannerOptions,
  StageEvaluation,
} from "./query-planner.js";
import { createQueryPlanner } from "./query-planner.js";

describe("QueryPlanner", () => {
  let planner: ReturnType<typeof createQueryPlanner>;

  beforeEach(() => {
    planner = createQueryPlanner();
  });

  describe("generatePlan", () => {
    it("should generate a basic plan from a goal", () => {
      const goal = "VitePressの設定方法を理解する";
      const plan = planner.generatePlan(goal);

      expect(plan).toMatchObject({
        id: expect.any(String),
        goal,
        status: "pending",
        stages: expect.arrayContaining([
          expect.objectContaining({
            stageNumber: 0,
            description: expect.any(String),
            query: expect.any(String),
            expectedResults: expect.objectContaining({
              // Improved extraction splits "VitePress" into "vite" and "press"
              keywords: expect.arrayContaining([
                expect.stringMatching(/vite|press|設定|方法/),
              ]),
              minConfidence: expect.any(Number),
              minMatches: expect.any(Number),
            }),
          }),
        ]),
      });
    });

    it("should use provided options to customize the plan", () => {
      const goal = "テスト戦略を理解する";
      const options: QueryPlannerOptions = {
        expectedResults: {
          keywords: ["vitest", "test", "coverage"],
          minMatches: 5,
          confidence: 0.8,
        },
        strategy: {
          initialMode: "specific",
          refinementMethod: "semantic",
        },
      };

      const plan = planner.generatePlan(goal, options);

      expect(plan.stages[0]?.expectedResults.keywords).toEqual(
        expect.arrayContaining(["vitest", "test", "coverage"]),
      );
      expect(plan.evaluationCriteria.minScore).toBe(0.8);
    });

    it("should extract keywords from goal if not provided", () => {
      const goal = "TypeScript configuration and setup";
      const plan = planner.generatePlan(goal);

      // Improved keyword extraction splits camelCase (TypeScript -> type, script)
      expect(plan.stages[0]?.expectedResults.keywords).toEqual(
        expect.arrayContaining(["type", "script", "configuration", "setup"]),
      );
    });
  });

  describe("evaluateStage", () => {
    it("should evaluate a stage based on actual results", () => {
      const stage: PlanStage = {
        stageNumber: 0,
        description: "Initial search",
        query: "vitepress config",
        expectedResults: {
          keywords: ["vitepress", "config", "export"],
          patterns: [],
          minConfidence: 0.7,
          minMatches: 3,
        },
      };

      const actualResults = [
        {
          id: "test-1",
          content: "export default defineConfig for VitePress",
          metadata: { sourceType: "file" as const },
          score: 0.9,
        },
        {
          id: "test-2",
          content: "VitePress configuration guide",
          metadata: { sourceType: "file" as const },
          score: 0.85,
        },
      ];

      const evaluation = planner.evaluateStage(stage, actualResults);

      expect(evaluation).toMatchObject({
        score: expect.any(Number),
        keywordMatches: expect.any(Number),
        confidence: expect.any(Number),
        feedback: expect.any(String),
        isSuccessful: expect.any(Boolean),
      });
    });

    it("should mark evaluation as unsuccessful if criteria not met", () => {
      const stage: PlanStage = {
        stageNumber: 0,
        description: "Search",
        query: "test",
        expectedResults: {
          keywords: ["vitest", "coverage", "threshold"],
          patterns: [],
          minConfidence: 0.9,
          minMatches: 10,
        },
      };

      const actualResults = [
        {
          id: "test-1",
          content: "simple test",
          metadata: { sourceType: "file" as const },
          score: 0.5,
        },
      ];

      const evaluation = planner.evaluateStage(stage, actualResults);

      expect(evaluation.isSuccessful).toBe(false);
      expect(evaluation.feedback).toContain("below expected");
    });
  });

  describe("refineQuery", () => {
    it("should refine query based on evaluation feedback", () => {
      const originalQuery = "vitepress";
      const evaluation: StageEvaluation = {
        score: 0.3,
        keywordMatches: 1,
        confidence: 0.3,
        feedback: "Too broad, missing config keywords",
        isSuccessful: false,
        suggestions: ["add config keyword", "be more specific"],
      };

      const refinedQuery = planner.refineQuery(
        originalQuery,
        evaluation,
        "semantic",
      );

      expect(refinedQuery).not.toBe(originalQuery);
      expect(refinedQuery.length).toBeGreaterThan(originalQuery.length);
    });

    it("should apply different refinement strategies", () => {
      const query = "test";
      const evaluation: StageEvaluation = {
        score: 0.5,
        keywordMatches: 1,
        confidence: 0.5,
        feedback: "Needs more specific terms",
        isSuccessful: false,
        suggestions: ["add framework name"],
      };

      const keywordRefined = planner.refineQuery(query, evaluation, "keywords");
      const semanticRefined = planner.refineQuery(
        query,
        evaluation,
        "semantic",
      );

      expect(keywordRefined).not.toBe(semanticRefined);
    });
  });

  describe("executeSingleStage", () => {
    it("should execute a single stage and return results", async () => {
      const goal = "Understanding testing";
      const plan = planner.generatePlan(goal);

      const mockQueryExecutor = async (query: string) => {
        return [
          {
            id: "test-1",
            content: `Result for query: ${query}`,
            metadata: { sourceType: "file" as const },
            score: 0.8,
          },
        ];
      };

      const result = await planner.executeSingleStage(
        plan,
        0,
        mockQueryExecutor,
      );

      expect(result).toMatchObject({
        stage: expect.any(Object),
        results: expect.any(Array),
        evaluation: expect.objectContaining({
          score: expect.any(Number),
          isSuccessful: expect.any(Boolean),
          feedback: expect.any(String),
        }),
        shouldContinue: expect.any(Boolean),
      });
    });

    it("should handle timeout gracefully", async () => {
      const goal = "Find specific function";
      const plan = planner.generatePlan(goal, {
        expectedResults: {
          keywords: ["function"],
          minMatches: 1,
          confidence: 0.7,
        },
      });

      const mockQueryExecutor = async () => {
        // Simulate slow query
        await new Promise((resolve) => setTimeout(resolve, 100));
        return [
          {
            id: "test-1",
            content: "function implementation",
            metadata: { sourceType: "file" as const },
            score: 0.9,
          },
        ];
      };

      const result = await planner.executeSingleStage(
        plan,
        0,
        mockQueryExecutor,
        { timeout: 50 }, // 50ms timeout
      );

      expect(result.timedOut).toBe(true);
      expect(result.results).toEqual([]);
    });
  });
});

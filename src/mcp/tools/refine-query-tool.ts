/**
 * Refine search query based on evaluation feedback
 * Provides suggestions for improving search results
 */

import { z } from "zod";
import { saveRefinementToCache } from "../utils/agent-cache.js";
import { createToolHandler } from "../utils/tool-handler.js";

// Schema for refine query tool
export const refineQueryToolSchema = z.object({
  currentQuery: z.string().describe("The current query that needs refinement"),
  goal: z.string().describe("The ultimate goal to achieve"),
  missingAspects: z
    .array(z.string())
    .optional()
    .default([])
    .describe("Aspects that are missing from current results"),
  foundAspects: z
    .array(z.string())
    .optional()
    .default([])
    .describe("Aspects that have been found"),
  strategy: z
    .enum(["broaden", "narrow", "pivot", "combine"])
    .optional()
    .default("combine")
    .describe("Refinement strategy to use"),
  iteration: z
    .number()
    .optional()
    .default(1)
    .describe("Current iteration number"),
});

export type RefineQueryToolInput = {
  currentQuery: string;
  goal: string;
  missingAspects?: string[];
  foundAspects?: string[];
  strategy?: "broaden" | "narrow" | "pivot" | "combine";
  iteration?: number;
};

/**
 * Extract base keywords from text
 */
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
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
    "about",
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
  ]);

  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));
}

/**
 * Generate query variations based on strategy
 */
function generateQueryVariations(
  currentQuery: string,
  goal: string,
  missingAspects: string[],
  _foundAspects: string[],
  strategy: string,
): {
  primaryQuery: string;
  alternativeQueries: string[];
  reasoning: string;
} {
  const currentKeywords = extractKeywords(currentQuery);
  const goalKeywords = extractKeywords(goal);
  const unusedGoalKeywords = goalKeywords.filter(
    (kw) => !currentKeywords.includes(kw),
  );

  let primaryQuery = currentQuery;
  let alternativeQueries: string[] = [];
  let reasoning = "";

  switch (strategy) {
    case "broaden":
      // Remove specific terms, keep general ones
      primaryQuery = currentKeywords
        .slice(0, Math.ceil(currentKeywords.length / 2))
        .join(" ");
      alternativeQueries = [
        goalKeywords.slice(0, 3).join(" "),
        goal.split(" ").slice(0, 3).join(" "),
      ];
      reasoning = "Broadening search to find more general results";
      break;

    case "narrow": {
      // Add more specific terms
      const additionalTerms =
        missingAspects.length > 0
          ? missingAspects.slice(0, 2).join(" ")
          : unusedGoalKeywords.slice(0, 2).join(" ");
      primaryQuery = `${currentQuery} ${additionalTerms}`.trim();
      alternativeQueries = [
        `${currentQuery} specific detailed`,
        `${currentQuery} implementation example`,
      ];
      reasoning = "Narrowing search to find more specific results";
      break;
    }

    case "pivot": {
      // Try a different approach
      const newKeywords = [
        ...unusedGoalKeywords,
        ...missingAspects.flatMap((a) => extractKeywords(a)),
      ];
      primaryQuery = newKeywords.slice(0, 4).join(" ");
      alternativeQueries = [
        missingAspects.slice(0, 2).join(" "),
        `${unusedGoalKeywords.join(" ")} tutorial`,
      ];
      reasoning = "Pivoting to different search terms";
      break;
    }
    default:
      // Smart combination based on what's missing
      if (missingAspects.length > 0) {
        // Focus on missing aspects
        const missingKeywords = missingAspects.flatMap((a) =>
          extractKeywords(a),
        );
        primaryQuery = [
          ...new Set([
            ...currentKeywords.slice(0, 2),
            ...missingKeywords.slice(0, 2),
          ]),
        ].join(" ");
        alternativeQueries = [
          missingAspects[0] || currentQuery,
          `${currentKeywords[0]} ${missingKeywords.join(" ")}`,
        ];
        reasoning = `Combining current terms with missing aspects: ${missingAspects.slice(0, 2).join(", ")}`;
      } else if (unusedGoalKeywords.length > 0) {
        // Add unused keywords from goal
        primaryQuery = [
          ...currentKeywords,
          ...unusedGoalKeywords.slice(0, 2),
        ].join(" ");
        alternativeQueries = [unusedGoalKeywords.join(" "), `${goal} guide`];
        reasoning = "Adding unused keywords from the original goal";
      } else {
        // Try synonyms and related terms
        primaryQuery = `${currentQuery} tutorial example documentation`;
        alternativeQueries = [`${currentQuery} guide`, `how to ${goal}`];
        reasoning = "Adding common documentation terms";
      }
  }

  // Filter out duplicates and empty queries
  alternativeQueries = [...new Set(alternativeQueries)]
    .filter((q) => q && q !== primaryQuery)
    .slice(0, 3);

  return {
    primaryQuery,
    alternativeQueries,
    reasoning,
  };
}

/**
 * Generate query improvement tips
 */
function generateTips(
  iteration: number,
  missingAspects: string[],
  foundAspects: string[],
): string[] {
  const tips: string[] = [];

  if (iteration === 1) {
    tips.push("Start with broad terms, then refine based on results");
  }

  if (iteration > 3) {
    tips.push("Consider if the information exists in the indexed content");
    tips.push("Try breaking down the goal into smaller, specific queries");
  }

  if (missingAspects.length > 3) {
    tips.push("Focus on the most important missing aspects first");
  }

  if (foundAspects.length > 5) {
    tips.push("You have good coverage. Focus on specific gaps");
  }

  if (missingAspects.some((a) => a.includes("example"))) {
    tips.push("Add 'example', 'sample', or 'demo' to your query");
  }

  if (missingAspects.some((a) => a.includes("configuration"))) {
    tips.push("Try 'config', 'setup', or 'settings' in your query");
  }

  return tips;
}

export const handleRefineQueryTool = createToolHandler(
  refineQueryToolSchema,
  async (data: RefineQueryToolInput, _options?: unknown) => {
    const {
      currentQuery,
      goal,
      missingAspects = [],
      foundAspects = [],
      strategy = "combine",
      iteration = 1,
    } = data;

    // Generate query variations
    const variations = generateQueryVariations(
      currentQuery,
      goal,
      missingAspects,
      foundAspects,
      strategy,
    );

    // Generate tips
    const tips = generateTips(iteration, missingAspects, foundAspects);

    // Save refinement to cache for future reference
    try {
      await saveRefinementToCache({
        goal,
        currentQuery,
        refinedQuery: variations.primaryQuery,
        strategy,
        reasoning: variations.reasoning,
        alternatives: variations.alternativeQueries.map((q, i) => ({
          query: q,
          purpose:
            i === 0
              ? "Direct search for missing aspects"
              : i === 1
                ? "Alternative phrasing"
                : "Broader exploration",
        })),
        iteration,
      });
    } catch (error) {
      // Log error but don't fail the refinement
      console.error("Failed to save refinement to cache:", error);
    }

    // Return structured refinement suggestions
    return {
      success: true,
      // Primary refined query
      refinedQuery: {
        query: variations.primaryQuery,
        reasoning: variations.reasoning,
        expectedImprovement:
          missingAspects.length > 0
            ? `Should help find: ${missingAspects.slice(0, 2).join(", ")}`
            : "Should broaden the search scope",
      },

      // Alternative queries to try
      alternatives: variations.alternativeQueries.map((q, i) => ({
        query: q,
        purpose:
          i === 0
            ? "Direct search for missing aspects"
            : i === 1
              ? "Alternative phrasing"
              : "Broader exploration",
      })),

      // Strategy information
      strategyInfo: {
        usedStrategy: strategy,
        alternativeStrategies: ["broaden", "narrow", "pivot", "combine"]
          .filter((s) => s !== strategy)
          .map((s) => ({
            strategy: s,
            when:
              s === "broaden"
                ? "If getting too few results"
                : s === "narrow"
                  ? "If getting too many irrelevant results"
                  : s === "pivot"
                    ? "If current approach isn't working"
                    : "For balanced refinement",
          })),
      },

      // Contextual information
      context: {
        iteration,
        totalKeywordsInGoal: extractKeywords(goal).length,
        keywordsUsed: extractKeywords(currentQuery).length,
        aspectsCovered: foundAspects.length,
        aspectsMissing: missingAspects.length,
      },

      // Tips for the agent
      tips,

      // Agent instructions
      agentInstructions: {
        nextStep: "Use gistdex_query with the refined query",
        fallbackPlan:
          "If no improvement after 2 more iterations, try the alternative queries",
        successCriteria: "High confidence (>75%) or all missing aspects found",
      },

      // Human-readable summary
      summary: `🔄 Query Refinement (Iteration ${iteration}):

📝 Current Query: "${currentQuery}"
🎯 Goal: "${goal}"

🔧 Refined Query: "${variations.primaryQuery}"
💡 Reasoning: ${variations.reasoning}

🔀 Alternatives:
${variations.alternativeQueries.map((q, i) => `  ${i + 1}. "${q}"`).join("\n")}

📊 Progress:
  ✅ Found: ${foundAspects.length} aspects
  ❌ Missing: ${missingAspects.length} aspects

💡 Tips:
${tips.map((t) => `  • ${t}`).join("\n")}

➡️ Next: Run gistdex_query with the refined query`,
    };
  },
);

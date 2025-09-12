import type { DatabaseService } from "../../core/database/database-service.js";
import { hybridSearch, semanticSearch } from "../../core/search/search.js";
import type { StructuredKnowledge } from "./structured-knowledge.js";

// Define SearchResult type locally to avoid import issues
export type SearchResult = {
  content: string;
  score?: number;
  metadata?: Record<string, unknown>;
};

export type QueryOptions = {
  hybrid?: boolean;
  k?: number;
  section?: boolean;
  full?: boolean;
  rerank?: boolean;
  type?: string;
};

export type QueryStage = {
  query: string;
  options: QueryOptions;
  description?: string;
  processResult?: (results: SearchResult[]) => SearchResult[];
};

export type QueryChain = {
  topic: string;
  stages: QueryStage[];
};

export type StageResult = {
  stageNumber: number;
  query: string;
  description?: string;
  results: SearchResult[];
};

export type ChainResult = {
  topic: string;
  stages: StageResult[];
  combinedResults: SearchResult[];
  timestamp: string;
};

/**
 * Deduplicate search results based on sourceId and chunkIndex
 * Keeps the result with the highest score for duplicates
 */
function deduplicateResults(results: SearchResult[]): SearchResult[] {
  const seen = new Map<string, SearchResult>();

  for (const result of results) {
    // Create unique key from sourceId and chunkIndex
    const sourceId = result.metadata?.sourceId as string | undefined;
    const chunkIndex = result.metadata?.chunkIndex as number | undefined;
    const key =
      sourceId && chunkIndex !== undefined
        ? `${sourceId}-${chunkIndex}`
        : `${Math.random()}`; // Fallback for results without proper metadata

    // Keep the result with higher score if duplicate found
    const existing = seen.get(key);
    if (!existing || (existing.score || 0) < (result.score || 0)) {
      seen.set(key, result);
    }
  }

  // Sort by score descending
  return Array.from(seen.values()).sort(
    (a, b) => (b.score || 0) - (a.score || 0),
  );
}

/**
 * Execute a chain of queries sequentially
 */
export async function executeQueryChain(
  chain: QueryChain,
  service: DatabaseService,
): Promise<ChainResult> {
  const stages: StageResult[] = [];
  const allResults: SearchResult[] = [];

  for (let i = 0; i < chain.stages.length; i++) {
    const stage = chain.stages[i];
    if (!stage) continue;

    // Execute search with stage options
    const results = await executeStageQuery(stage, service);

    // Process results if processor is defined
    const processedResults = stage.processResult
      ? stage.processResult(results)
      : results;

    // Store stage results
    stages.push({
      stageNumber: i + 1,
      query: stage.query,
      description: stage.description,
      results: processedResults,
    });

    // Accumulate all results
    allResults.push(...processedResults);
  }

  // Deduplicate combined results
  const uniqueResults = deduplicateResults(allResults);

  return {
    topic: chain.topic,
    stages,
    combinedResults: uniqueResults,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Execute a single stage query
 */
async function executeStageQuery(
  stage: QueryStage,
  service: DatabaseService,
): Promise<SearchResult[]> {
  const { query, options } = stage;

  if (options.hybrid) {
    // Hybrid search
    const results = await hybridSearch(
      query,
      {
        k: options.k || 10,
        keywordWeight: 0.3,
        sourceType: options.type,
      },
      service,
    );
    return results.map((r) => ({
      content: r.content,
      score: r.score,
      metadata: r.metadata,
    }));
  } else {
    // Semantic search
    const results = await semanticSearch(
      query,
      {
        k: options.k || 5,
        sourceType: options.type,
      },
      service,
    );
    return results.map((r) => ({
      content: r.content,
      score: r.score,
      metadata: r.metadata,
    }));
  }
}

/**
 * Build structured knowledge from chain results
 */
export function buildStructuredResult(
  chainResult: ChainResult,
): Omit<StructuredKnowledge, "lastUpdated"> {
  const { topic, stages, combinedResults, timestamp } = chainResult;

  // Format topic name for display - handle camelCase and dash-case
  const formattedTopic = topic
    .replace(/([A-Z])/g, " $1") // Add space before capital letters
    .split(/[-_]/) // Split by dash or underscore
    .map((word) => word.trim())
    .filter((word) => word.length > 0)
    .map((word, _index) => {
      // Preserve "TypeScript", "JavaScript" etc.
      if (word.toLowerCase() === "typescript") return "TypeScript";
      if (word.toLowerCase() === "javascript") return "JavaScript";
      // Capitalize first letter of each word
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");

  const lines: string[] = [`# ${formattedTopic}`];
  lines.push("");

  if (stages.length === 0 || combinedResults.length === 0) {
    lines.push("No results found for this query chain.");
  } else {
    lines.push("## Query Chain Results");
    lines.push("");
    lines.push(`Generated: ${timestamp}`);
    lines.push("");

    // Add stage details
    for (const stage of stages) {
      const stageTitle = stage.description || `Query ${stage.stageNumber}`;
      lines.push(
        `### Stage ${stage.stageNumber}: ${stageTitle.replace(/^Stage \d+: /, "")}`,
      );
      lines.push("");
      lines.push(`**Query**: "${stage.query}"`);
      lines.push(`**Results**: ${stage.results.length} items`);
      lines.push("");

      if (stage.results.length > 0) {
        lines.push("#### Top Results:");
        lines.push("");

        // Show top 3 results from each stage
        const topResults = stage.results.slice(0, 3);
        for (const result of topResults) {
          const preview = result.content.substring(0, 200);
          const trimmed =
            preview.length < result.content.length ? `${preview}...` : preview;
          lines.push(`- ${trimmed.replace(/\n/g, " ")}`);
          if (result.score) {
            lines.push(`  - Score: ${result.score.toFixed(3)}`);
          }
        }
        lines.push("");
      }
    }

    // Add combined summary
    lines.push("## Combined Summary");
    lines.push("");
    lines.push(`**Total unique results**: ${combinedResults.length}`);
    lines.push(`**Query stages executed**: ${stages.length}`);

    // Add unique file sources
    const uniqueFiles = new Set<string>();
    combinedResults.forEach((r) => {
      const filePath = r.metadata?.filePath || r.metadata?.title;
      if (filePath && typeof filePath === "string") {
        uniqueFiles.add(filePath.split("/").pop() || filePath);
      }
    });

    if (uniqueFiles.size > 0) {
      lines.push(
        `**Unique sources**: ${Array.from(uniqueFiles).slice(0, 5).join(", ")}${uniqueFiles.size > 5 ? "..." : ""}`,
      );
    }

    // Add score range
    const scores = combinedResults
      .map((r) => r.score || 0)
      .filter((s) => s > 0);
    if (scores.length > 0) {
      const maxScore = Math.max(...scores);
      const minScore = Math.min(...scores);
      lines.push(
        `**Score range**: ${minScore.toFixed(3)} - ${maxScore.toFixed(3)}`,
      );
    }
  }

  // Build metadata
  const metadata: Record<string, unknown> = {
    queryCount: stages.length,
    resultCount: combinedResults.length,
    timestamp,
    queries: stages.map((s) => s.query),
  };

  return {
    topic,
    content: lines.join("\n"),
    metadata,
  };
}

/**
 * Save chain result as structured knowledge
 */
export async function saveChainResult(
  chainResult: ChainResult,
  cacheDir?: string,
): Promise<void> {
  const { saveStructuredKnowledge } = await import("./structured-knowledge.js");
  const structured = buildStructuredResult(chainResult);
  await saveStructuredKnowledge(structured, cacheDir);
}

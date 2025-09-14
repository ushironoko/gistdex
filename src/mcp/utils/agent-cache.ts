import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getCacheDir } from "./query-cache.js";

export interface AgentEvaluationCache {
  goal: string;
  query: string;
  confidence: number;
  coverage: number;
  relevance: number;
  foundAspects: string[];
  missingAspects: string[];
  shouldContinue: boolean;
  timestamp: string;
  iteration: number;
}

export interface AgentRefinementCache {
  goal: string;
  currentQuery: string;
  refinedQuery: string;
  strategy: string;
  reasoning: string;
  alternatives: Array<{ query: string; purpose: string }>;
  timestamp: string;
  iteration: number;
}

export interface AgentStageCache {
  planId: string;
  stageIndex: number;
  goal: string;
  query: string;
  resultsCount: number;
  evaluation: {
    score: number;
    isSuccessful: boolean;
    feedback: string;
  };
  shouldContinue: boolean;
  timestamp: string;
}

export interface AgentCache {
  version: string;
  evaluations: AgentEvaluationCache[];
  refinements: AgentRefinementCache[];
  stages: AgentStageCache[];
}

const AGENT_CACHE_VERSION = "1.0.0";

/**
 * Get the agent cache directory path
 */
export function getAgentCacheDir(): string {
  const cacheDir = getCacheDir();
  return join(cacheDir, "agent");
}

/**
 * Ensure agent cache directories exist
 */
export async function ensureAgentCacheDirectories(): Promise<void> {
  const agentDir = getAgentCacheDir();
  const subdirs = ["evaluations", "refinements", "stages", "sessions"];

  if (!existsSync(agentDir)) {
    mkdirSync(agentDir, { recursive: true });
  }

  for (const subdir of subdirs) {
    const path = join(agentDir, subdir);
    if (!existsSync(path)) {
      mkdirSync(path, { recursive: true });
    }
  }
}

/**
 * Load agent cache from disk
 */
export function loadAgentCache(): AgentCache {
  const cacheFile = join(getAgentCacheDir(), "agent-cache.json");

  if (!existsSync(cacheFile)) {
    return {
      version: AGENT_CACHE_VERSION,
      evaluations: [],
      refinements: [],
      stages: [],
    };
  }

  try {
    const content = readFileSync(cacheFile, "utf-8");
    const cache = JSON.parse(content) as AgentCache;

    if (cache.version !== AGENT_CACHE_VERSION) {
      console.warn(
        `Agent cache version mismatch. Expected ${AGENT_CACHE_VERSION}, got ${cache.version}`,
      );
      return {
        version: AGENT_CACHE_VERSION,
        evaluations: [],
        refinements: [],
        stages: [],
      };
    }

    return cache;
  } catch (error) {
    console.error("Failed to load agent cache:", error);
    return {
      version: AGENT_CACHE_VERSION,
      evaluations: [],
      refinements: [],
      stages: [],
    };
  }
}

/**
 * Save evaluation result to cache
 */
export async function saveEvaluationToCache(
  evaluation: Omit<AgentEvaluationCache, "timestamp">,
): Promise<string> {
  await ensureAgentCacheDirectories();

  // Debug log to file
  const debugInfo = {
    agentCacheDir: getAgentCacheDir(),
    cwd: process.cwd(),
    timestamp: new Date().toISOString(),
    evaluation,
  };

  try {
    const debugFile = join(getAgentCacheDir(), "debug.log");
    const existingDebug = existsSync(debugFile)
      ? readFileSync(debugFile, "utf-8")
      : "";
    writeFileSync(
      debugFile,
      `${existingDebug}\n${JSON.stringify(debugInfo, null, 2)}\n---\n`,
    );
  } catch (e) {
    console.error("Failed to write debug log:", e);
    // Try to write to /tmp as fallback
    try {
      const tmpDebugFile = "/tmp/gistdex-agent-debug.log";
      const existingTmpDebug = existsSync(tmpDebugFile)
        ? readFileSync(tmpDebugFile, "utf-8")
        : "";
      writeFileSync(
        tmpDebugFile,
        existingTmpDebug +
          "\n" +
          JSON.stringify(debugInfo, null, 2) +
          "\n---\n",
      );
    } catch (tmpError) {
      console.error("Failed to write to /tmp:", tmpError);
    }
  }

  const cache = loadAgentCache();
  const evaluationData: AgentEvaluationCache = {
    ...evaluation,
    timestamp: new Date().toISOString(),
  };

  cache.evaluations.push(evaluationData);

  // Keep only last 100 evaluations
  if (cache.evaluations.length > 100) {
    cache.evaluations = cache.evaluations.slice(-100);
  }

  // Save main cache
  const cacheFile = join(getAgentCacheDir(), "agent-cache.json");
  try {
    writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
  } catch (e) {
    console.error("Failed to save main cache:", e);
    // Try /tmp as fallback
    const tmpFile = "/tmp/gistdex-agent-cache.json";
    writeFileSync(tmpFile, JSON.stringify(cache, null, 2));
    console.log("Saved to /tmp instead");
  }

  // Save individual evaluation
  const evalDir = join(getAgentCacheDir(), "evaluations");
  const evalFile = join(
    evalDir,
    `eval-${Date.now()}-${evaluation.iteration}.json`,
  );
  try {
    writeFileSync(evalFile, JSON.stringify(evaluationData, null, 2));
  } catch (e) {
    console.error("Failed to save evaluation file:", e);
    const tmpEvalFile = `/tmp/eval-${Date.now()}-${evaluation.iteration}.json`;
    writeFileSync(tmpEvalFile, JSON.stringify(evaluationData, null, 2));
    console.log("Saved evaluation to /tmp instead");
  }

  // Update markdown summary
  try {
    await saveAgentCacheAsMarkdown(cache);
  } catch (e) {
    console.error("Failed to save markdown summary:", e);
  }

  return evalFile;
}

/**
 * Save refinement result to cache
 */
export async function saveRefinementToCache(
  refinement: Omit<AgentRefinementCache, "timestamp">,
): Promise<string> {
  await ensureAgentCacheDirectories();

  const cache = loadAgentCache();
  const refinementData: AgentRefinementCache = {
    ...refinement,
    timestamp: new Date().toISOString(),
  };

  cache.refinements.push(refinementData);

  // Keep only last 100 refinements
  if (cache.refinements.length > 100) {
    cache.refinements = cache.refinements.slice(-100);
  }

  // Save main cache
  const cacheFile = join(getAgentCacheDir(), "agent-cache.json");
  writeFileSync(cacheFile, JSON.stringify(cache, null, 2));

  // Save individual refinement
  const refineDir = join(getAgentCacheDir(), "refinements");
  const refineFile = join(
    refineDir,
    `refine-${Date.now()}-${refinement.iteration}.json`,
  );
  writeFileSync(refineFile, JSON.stringify(refinementData, null, 2));

  // Update markdown summary
  await saveAgentCacheAsMarkdown(cache);

  return refineFile;
}

/**
 * Save stage execution result to cache
 */
export async function saveStageToCache(
  stage: Omit<AgentStageCache, "timestamp">,
): Promise<string> {
  await ensureAgentCacheDirectories();

  const cache = loadAgentCache();
  const stageData: AgentStageCache = {
    ...stage,
    timestamp: new Date().toISOString(),
  };

  cache.stages.push(stageData);

  // Keep only last 100 stages
  if (cache.stages.length > 100) {
    cache.stages = cache.stages.slice(-100);
  }

  // Save main cache
  const cacheFile = join(getAgentCacheDir(), "agent-cache.json");
  writeFileSync(cacheFile, JSON.stringify(cache, null, 2));

  // Save individual stage
  const stageDir = join(getAgentCacheDir(), "stages");
  const stageFile = join(
    stageDir,
    `stage-${Date.now()}-${stage.planId}-${stage.stageIndex}.json`,
  );
  writeFileSync(stageFile, JSON.stringify(stageData, null, 2));

  // Update markdown summary
  await saveAgentCacheAsMarkdown(cache);

  return stageFile;
}

/**
 * Save agent cache as markdown for easy reading
 */
async function saveAgentCacheAsMarkdown(cache: AgentCache): Promise<void> {
  const lines: string[] = [
    "# Agent in the Loop Cache",
    "",
    `Version: ${cache.version}`,
    `Last updated: ${new Date().toISOString()}`,
    "",
  ];

  // Recent evaluations
  if (cache.evaluations.length > 0) {
    lines.push("## Recent Evaluations");
    lines.push("");
    const recent = cache.evaluations.slice(-5);
    recent.forEach((evalData) => {
      lines.push(`### Evaluation - Iteration ${evalData.iteration}`);
      lines.push(`- **Goal**: ${evalData.goal}`);
      lines.push(`- **Query**: "${evalData.query}"`);
      lines.push(
        `- **Confidence**: ${(evalData.confidence * 100).toFixed(1)}%`,
      );
      lines.push(`- **Coverage**: ${(evalData.coverage * 100).toFixed(1)}%`);
      lines.push(
        `- **Should Continue**: ${evalData.shouldContinue ? "Yes" : "No"}`,
      );
      if (evalData.foundAspects.length > 0) {
        lines.push(`- **Found**: ${evalData.foundAspects.join(", ")}`);
      }
      if (evalData.missingAspects.length > 0) {
        lines.push(`- **Missing**: ${evalData.missingAspects.join(", ")}`);
      }
      lines.push(`- **Time**: ${evalData.timestamp}`);
      lines.push("");
    });
  }

  // Recent refinements
  if (cache.refinements.length > 0) {
    lines.push("## Recent Query Refinements");
    lines.push("");
    const recent = cache.refinements.slice(-5);
    recent.forEach((refine) => {
      lines.push(`### Refinement - Iteration ${refine.iteration}`);
      lines.push(`- **Goal**: ${refine.goal}`);
      lines.push(`- **Original**: "${refine.currentQuery}"`);
      lines.push(`- **Refined**: "${refine.refinedQuery}"`);
      lines.push(`- **Strategy**: ${refine.strategy}`);
      lines.push(`- **Reasoning**: ${refine.reasoning}`);
      if (refine.alternatives.length > 0) {
        lines.push(`- **Alternatives**:`);
        refine.alternatives.forEach((alt) => {
          lines.push(`  - "${alt.query}" - ${alt.purpose}`);
        });
      }
      lines.push(`- **Time**: ${refine.timestamp}`);
      lines.push("");
    });
  }

  // Recent stage executions
  if (cache.stages.length > 0) {
    lines.push("## Recent Stage Executions");
    lines.push("");
    const recent = cache.stages.slice(-5);
    recent.forEach((stage) => {
      lines.push(`### Stage ${stage.stageIndex} - Plan ${stage.planId}`);
      lines.push(`- **Goal**: ${stage.goal}`);
      lines.push(`- **Query**: "${stage.query}"`);
      lines.push(`- **Results**: ${stage.resultsCount}`);
      lines.push(`- **Score**: ${stage.evaluation.score.toFixed(2)}`);
      lines.push(
        `- **Success**: ${stage.evaluation.isSuccessful ? "Yes" : "No"}`,
      );
      lines.push(`- **Feedback**: ${stage.evaluation.feedback}`);
      lines.push(`- **Continue**: ${stage.shouldContinue ? "Yes" : "No"}`);
      lines.push(`- **Time**: ${stage.timestamp}`);
      lines.push("");
    });
  }

  const mdFile = join(getAgentCacheDir(), "agent-cache.md");
  writeFileSync(mdFile, lines.join("\n"));
}

/**
 * Create a session summary for the entire Agent in the Loop workflow
 */
export async function saveAgentSession(
  sessionId: string,
  goal: string,
  evaluations: AgentEvaluationCache[],
  refinements: AgentRefinementCache[],
  stages: AgentStageCache[],
  finalSummary: string,
): Promise<string> {
  await ensureAgentCacheDirectories();

  const sessionDir = join(getAgentCacheDir(), "sessions");
  const sessionFile = join(sessionDir, `session-${sessionId}.md`);

  const lines: string[] = [
    `# Agent in the Loop Session`,
    "",
    `**Session ID**: ${sessionId}`,
    `**Goal**: ${goal}`,
    `**Timestamp**: ${new Date().toISOString()}`,
    "",
    "## Workflow Summary",
    "",
    `- Total Iterations: ${evaluations.length}`,
    `- Query Refinements: ${refinements.length}`,
    `- Stages Executed: ${stages.length}`,
    "",
  ];

  // Add iteration details
  if (evaluations.length > 0) {
    lines.push("## Iterations");
    lines.push("");
    evaluations.forEach((evalData, index) => {
      lines.push(`### Iteration ${index + 1}`);
      lines.push(`**Query**: "${evalData.query}"`);
      lines.push(`**Confidence**: ${(evalData.confidence * 100).toFixed(1)}%`);

      const refinement = refinements.find(
        (r) => r.iteration === evalData.iteration,
      );
      if (refinement) {
        lines.push(`**Refined to**: "${refinement.refinedQuery}"`);
        lines.push(`**Strategy**: ${refinement.strategy}`);
      }

      lines.push("");
    });
  }

  // Add final summary
  lines.push("## Final Results");
  lines.push("");
  lines.push(finalSummary);

  writeFileSync(sessionFile, lines.join("\n"));

  return sessionFile;
}

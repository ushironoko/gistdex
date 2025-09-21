#!/usr/bin/env tsx

/**
 * Standalone version of run-doc-analysis.ts that uses the public API
 * This demonstrates how the script would work if gistdex-ci was a separate package
 */

import { appendFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

// In a separate package, this would be:
// import { analyzeDocumentImpact } from "@ushironoko/gistdex";
import { analyzeDocumentImpact } from "../../dist/index.js";

interface ParsedArgs {
  diff?: string;
  paths?: string;
  threshold?: string;
  output?: string;
}

async function main() {
  try {
    const { values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        diff: { type: "string" },
        paths: { type: "string" },
        threshold: { type: "string" },
        output: { type: "string" },
      },
    }) as { values: ParsedArgs };

    const outputFile = values.output || "doc-impact.json";

    // Parse paths if provided
    const paths = values.paths
      ? values.paths.split(",").map((p) => p.trim())
      : undefined;

    // Run the document impact analysis using public API
    const results = await analyzeDocumentImpact({
      diff: values.diff,
      paths,
      threshold: values.threshold ? parseFloat(values.threshold) : undefined,
      format: "json",
    });

    // Parse the JSON string result (formatJSON returns a string)
    const parsedResults =
      typeof results === "string" ? JSON.parse(results) : results;

    // Write results to file (keep the full format for compatibility)
    writeFileSync(
      outputFile,
      typeof results === "string" ? results : JSON.stringify(results, null, 2),
    );

    // Check if there's any impact
    const hasImpact = parsedResults.results
      ? parsedResults.results.length > 0
      : parsedResults.length > 0;

    // Set GitHub Actions output
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `has_impact=${hasImpact}\n`);
    }

    // Log result for debugging
    console.error(`Analysis complete. Has impact: ${hasImpact}`);
    console.error(`Results written to: ${outputFile}`);

    process.exit(0);
  } catch (error) {
    console.error("Error running documentation impact analysis:", error);

    // Set has_impact to false on error
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, "has_impact=false\n");
    }

    process.exit(1);
  }
}

main();

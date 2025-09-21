#!/usr/bin/env tsx

/**
 * Standalone version of run-doc-analysis.ts that uses the public API
 * This demonstrates how the script would work if gistdex-ci was a separate package
 */

import { appendFileSync } from "node:fs";
import { parseArgs } from "node:util";

// In a separate package, this would be:
// import { analyzeDocumentImpact } from "@ushironoko/gistdex";
import { analyzeDocumentImpact } from "../../dist/index.js";

interface ParsedArgs {
  diff?: string;
  paths?: string;
  threshold?: string;
}

async function main() {
  try {
    const { values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        diff: { type: "string" },
        paths: { type: "string" },
        threshold: { type: "string" },
      },
    }) as { values: ParsedArgs };

    // Parse paths if provided
    const paths = values.paths
      ? values.paths.split(",").map((p) => p.trim())
      : undefined;

    // Run the document impact analysis using public API with github-comment format
    const comment = await analyzeDocumentImpact({
      diff: values.diff,
      paths,
      threshold: values.threshold ? parseFloat(values.threshold) : undefined,
      format: "github-comment",
    });

    // Check if there's any impact by looking for the no impact message
    const hasImpact =
      typeof comment === "string"
        ? !comment.includes("No documentation impact detected")
        : true;

    // Write the comment to stdout for the next step
    console.log(comment);

    // Set GitHub Actions output
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `has_impact=${hasImpact}\n`);
    }

    // Log result for debugging (to stderr so it doesn't mix with stdout)
    console.error(`Analysis complete. Has impact: ${hasImpact}`);

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

#!/usr/bin/env tsx

import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { handleCIDoc } from "../../src/cli/commands/ci-doc.js";

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

    // Run the document impact analysis
    const originalWrite = process.stdout.write;
    let capturedOutput = "";

    // Capture stdout output
    process.stdout.write = (chunk: string | Uint8Array): boolean => {
      if (typeof chunk === "string") {
        capturedOutput += chunk;
      }
      return true;
    };

    try {
      await handleCIDoc({
        values: {
          ...values,
          format: "json",
        },
      });
    } finally {
      // Restore original stdout
      process.stdout.write = originalWrite;
    }

    // Write the captured output to file
    writeFileSync(outputFile, capturedOutput);

    // Parse the output to check if there's any impact
    let hasImpact = false;
    try {
      const result = JSON.parse(capturedOutput);
      hasImpact = Array.isArray(result) && result.length > 0;
    } catch (parseError) {
      console.error("Failed to parse analysis output:", parseError);
      hasImpact = false;
    }

    // Set GitHub Actions output
    if (process.env.GITHUB_OUTPUT) {
      const fs = await import("node:fs");
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `has_impact=${hasImpact}\n`);
    }

    // Log result for debugging
    console.error(`Analysis complete. Has impact: ${hasImpact}`);
    console.error(`Results written to: ${outputFile}`);

    process.exit(0);
  } catch (error) {
    console.error("Error running documentation impact analysis:", error);

    // Set has_impact to false on error
    if (process.env.GITHUB_OUTPUT) {
      const fs = await import("node:fs");
      fs.appendFileSync(process.env.GITHUB_OUTPUT, "has_impact=false\n");
    }

    process.exit(1);
  }
}

main();

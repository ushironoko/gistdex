#!/usr/bin/env tsx

/**
 * Standalone version of post-github-comment.ts that uses the public API
 * This demonstrates how the script would work if gistdex-ci was a separate package
 */

import { readFileSync } from "node:fs";
import { argv, env, exit } from "node:process";

// In a separate package, this would be:
// import { postDocumentImpactToGitHub, type DocumentImpactResult } from "@ushironoko/gistdex";
import {
  type DocumentImpactResult,
  postDocumentImpactToGitHub,
} from "../../dist/index.js";

async function main() {
  try {
    // Get input file from command line
    const inputFile = argv[2];
    if (!inputFile) {
      console.error(
        "Usage: tsx post-github-comment-standalone.ts <input-file>",
      );
      exit(1);
    }

    // Read and parse the analysis results
    const content = readFileSync(inputFile, "utf-8");
    const parsed = JSON.parse(content);

    // Handle both formats: direct array or object with results field
    let results: DocumentImpactResult[];
    let threshold = 0.7; // default threshold

    if (Array.isArray(parsed)) {
      results = parsed as DocumentImpactResult[];
    } else if (parsed && typeof parsed === "object" && "results" in parsed) {
      // Extract results from the formatted output
      // Map the results to flatten metadata fields for API compatibility
      results = parsed.results.map(
        (r: {
          file: string;
          similarity?: number;
          score?: number;
          matchedTerms?: string[];
          sections?: string[];
          changeType?: string;
          startLine?: number;
          endLine?: number;
          githubUrl?: string;
          metadata?: {
            changeType?: string;
            startLine?: number;
            endLine?: number;
            githubUrl?: string;
          };
        }) => ({
          file: r.file,
          similarity: r.similarity ?? r.score ?? 0,
          matchedTerms: r.matchedTerms ?? r.sections,
          changeType: r.metadata?.changeType ?? r.changeType ?? "modified",
          startLine: r.metadata?.startLine ?? r.startLine,
          endLine: r.metadata?.endLine ?? r.endLine,
          githubUrl: r.metadata?.githubUrl ?? r.githubUrl,
        }),
      ) as DocumentImpactResult[];

      if (parsed.threshold) {
        threshold = parsed.threshold;
      }
    } else {
      console.log(
        "Invalid format or no documentation impact detected. Skipping comment.",
      );
      exit(0);
    }

    if (!results || results.length === 0) {
      console.log("No documentation impact detected. Skipping comment.");
      exit(0);
    }

    // Get environment variables
    const token = env.GITHUB_TOKEN;
    const repository = env.GITHUB_REPOSITORY;
    const issueNumber = env.GITHUB_ISSUE_NUMBER;

    if (!token || !repository || !issueNumber) {
      console.error(
        "Missing required environment variables: GITHUB_TOKEN, GITHUB_REPOSITORY, or GITHUB_ISSUE_NUMBER",
      );
      exit(1);
    }

    // Post the comment using the public API
    await postDocumentImpactToGitHub(results, {
      token,
      repository,
      issueNumber: parseInt(issueNumber, 10),
      threshold,
    });

    console.log(`Successfully posted comment to PR #${issueNumber}`);
    exit(0);
  } catch (error) {
    console.error("Error posting GitHub comment:", error);
    exit(1);
  }
}

main();

import { analyzeDocuments } from "../../core/ci/doc-service.js";
import {
  formatGitHubComment,
  formatJSON,
  formatMarkdown,
  type SimilarityCheckResult,
} from "../../core/ci/formatters.js";
import { postToGitHubPR } from "../../core/ci/github-integration.js";
import {
  checkCodeSimilarity,
  simpleSimilarityCheck,
} from "../../core/ci/similarity-checker.js";
import { createConfigOperations } from "../../core/config/config-operations.js";
import type { CommandContext } from "../utils/command-handler.js";
import { createReadOnlyCommandHandler } from "../utils/command-handler.js";

export interface CIDocContext extends CommandContext {
  values: {
    diff?: string;
    threshold?: string;
    paths?: string;
    format?: string;
    "github-pr"?: boolean;
    verbose?: boolean;
    provider?: string;
    db?: string;
  };
}

export const handleCIDoc = createReadOnlyCommandHandler<CIDocContext>(
  async (db, ctx) => {
    const args = ctx.values;
    // Get configuration
    const configOps = createConfigOperations();
    const config = await configOps.load();
    const ciConfig = config.ci?.doc;
    const threshold = args.threshold
      ? Number.parseFloat(args.threshold)
      : (ciConfig?.threshold ?? 0.7);
    const format = (args.format ?? "markdown") as
      | "markdown"
      | "json"
      | "github-comment";
    const diffRange = args.diff ?? "HEAD~1";

    // Parse document paths
    let documentPaths: string[];
    if (args.paths) {
      documentPaths = args.paths.split(",").map((p) => p.trim());
    } else if (ciConfig?.documentPaths) {
      documentPaths = ciConfig.documentPaths;
    } else {
      documentPaths = ["docs/**/*.md", "README.md", "*.md"];
    }

    // Log configuration if verbose
    if (args.verbose) {
      console.log("📋 Configuration:");
      console.log(`  - Diff range: ${diffRange}`);
      console.log(`  - Threshold: ${threshold}`);
      console.log(`  - Document paths: ${documentPaths.join(", ")}`);
      console.log(`  - Format: ${format}`);
      console.log("");
    }

    // Analyze documents
    const results = await analyzeDocuments(
      diffRange,
      {
        threshold,
        documentPaths,
        verbose: args.verbose,
      },
      db,
    );

    // Run similarity check (always enabled for CI)
    let similarityCheck: SimilarityCheckResult | undefined;
    try {
      similarityCheck = await checkCodeSimilarity(diffRange, 0.8);

      // Fallback to simple check if tool not available
      if (
        !similarityCheck.hasIssues &&
        similarityCheck.message === "Similarity check tool not available"
      ) {
        similarityCheck = simpleSimilarityCheck(diffRange);
      }
    } catch (error) {
      console.error("Similarity check failed:", error);
      similarityCheck = {
        hasIssues: false,
        message: "Similarity check could not be performed",
      };
    }

    // Format results
    let output: string;
    switch (format) {
      case "json":
        output = formatJSON(results, threshold, diffRange);
        break;
      case "github-comment":
        output = formatGitHubComment(results, threshold, similarityCheck);
        break;
      default:
        output = formatMarkdown(results, threshold);
        break;
    }

    // Handle GitHub PR integration
    if (args["github-pr"]) {
      try {
        await postToGitHubPR(output);
        console.log("✅ Posted analysis to GitHub PR");
      } catch (error) {
        console.error("❌ Failed to post to GitHub PR:", error);
        // Still output the results even if posting fails
      }
    }

    // Output results
    console.log(output);

    // Return void for command handler
  },
);

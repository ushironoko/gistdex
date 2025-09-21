import {
  analyzeDocumentImpact,
  type DocumentImpactOptions,
} from "../../core/ci/api.js";
import { formatGitHubComment } from "../../core/ci/formatters.js";
import { postToGitHubPR } from "../../core/ci/github-integration.js";
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
    "db-path"?: string;
  };
}

export const handleCIDoc = createReadOnlyCommandHandler<CIDocContext>(
  async (_db, ctx) => {
    const args = ctx.values;

    // Convert CLI arguments to DocumentImpactOptions
    const options: DocumentImpactOptions = {
      diff: args.diff ?? "HEAD~1",
      threshold: args.threshold ? Number.parseFloat(args.threshold) : undefined,
      format: (args.format ?? "json") as "json" | "github-comment",
      verbose: args.verbose,
    };

    // Parse document paths if provided
    if (args.paths) {
      options.paths = args.paths.split(",").map((p) => p.trim());
    }

    // Add database override options if provided
    if (args.provider || args["db-path"]) {
      options.database = {
        provider: args.provider,
        path: args["db-path"],
      };
    }

    // Log configuration if verbose (before analysis for better UX)
    if (args.verbose) {
      const config = await createConfigOperations().load();
      const ciConfig = config.ci?.doc;
      const finalThreshold = options.threshold ?? ciConfig?.threshold ?? 0.7;
      const finalPaths = options.paths ??
        ciConfig?.documentPaths ?? ["docs/**/*.md", "README.md", "*.md"];

      console.log("📋 Configuration:");
      console.log(`  - Diff range: ${options.diff}`);
      console.log(`  - Threshold: ${finalThreshold}`);
      console.log(`  - Document paths: ${finalPaths.join(", ")}`);
      console.log(`  - Format: ${options.format}`);
      if (options.database) {
        console.log(
          `  - Database provider: ${options.database.provider ?? "default"}`,
        );
        console.log(`  - Database path: ${options.database.path ?? "default"}`);
      }
      console.log("");
    }

    try {
      // Use the API to analyze documents
      const result = await analyzeDocumentImpact(options);

      // Handle GitHub PR integration
      if (args["github-pr"]) {
        try {
          // If result is string (formatted), use it directly
          const comment =
            typeof result === "string"
              ? result
              : formatGitHubComment(result, options.threshold ?? 0.7);
          await postToGitHubPR(comment);
          console.log("✅ Posted analysis to GitHub PR");
        } catch (error) {
          console.error("❌ Failed to post to GitHub PR:", error);
          // Still output the results even if posting fails
        }
      }

      // Output results
      console.log(
        typeof result === "string" ? result : JSON.stringify(result, null, 2),
      );
    } catch (error) {
      console.error("❌ Analysis failed:", error);
      process.exit(1);
    }
  },
);

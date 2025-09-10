import {
  calculateSearchStats,
  getOriginalContent,
  getSectionContent,
  hybridSearch,
  semanticSearch,
} from "../../core/search/search.js";
import { parseCliInteger } from "../utils/arg-parser.js";
import { createReadOnlyCommandHandler } from "../utils/command-handler.js";
import { handleCliError } from "../utils/error-handler.js";

interface QueryContext {
  values: {
    provider?: string;
    db?: string;
    "top-k"?: string;
    type?: string;
    hybrid?: boolean;
    "no-rerank"?: boolean;
    full?: boolean;
    section?: boolean;
    [key: string]: string | boolean | undefined;
  };
  positionals?: string[]; // gunshi provides positionals in the context
}

export const handleQuery = createReadOnlyCommandHandler<QueryContext>(
  async (service, ctx) => {
    // gunshi provides positionals in the context
    const positionals = ctx.positionals || [];
    const query = positionals.join(" ").trim();

    if (!query) {
      handleCliError(new Error("No query specified"));
    }

    const values = ctx.values;

    // Check for mutually exclusive options
    if (values.full && values.section) {
      handleCliError(
        new Error("Cannot use both --full and --section options together"),
      );
    }

    const options = {
      k: parseCliInteger(values["top-k"] as string | undefined, 5) ?? 5,
      sourceType: values.type as string | undefined,
      rerank: !values["no-rerank"],
    };

    console.log(`Searching for: "${query}"\n`);

    const results = values.hybrid
      ? await hybridSearch(query, options, service)
      : await semanticSearch(query, options, service);

    if (results.length === 0) {
      console.log("No results found");
      return;
    }

    // Check if full content should be outputted without formatting
    const useFullSingle = values.full === true && options.k === 1;

    if (useFullSingle && results.length === 1) {
      // Output full original content for single result
      const firstResult = results[0];
      if (!firstResult) {
        console.log("No results found");
        return;
      }

      // Get the full original content from the source
      const originalContent = await getOriginalContent(firstResult, service);
      console.log(originalContent || firstResult.content || "");
    } else {
      // Normal formatted output
      const stats = calculateSearchStats(results);

      console.log(`Found ${stats.totalResults} results\n`);

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (!result) continue;

        const metadata = result.metadata || {};
        console.log(`${i + 1}. ${metadata.title || "(Untitled)"}`);

        if (metadata.url) {
          console.log(`   URL: ${metadata.url}`);
        }

        console.log(`   Score: ${result.score.toFixed(3)}`);
        console.log(`   Type: ${metadata.sourceType || "unknown"}`);

        const showFull = !!values.full;
        const showSection = !!values.section;
        let contentToShow: string;

        if (showSection) {
          // Get the full section content for markdown files
          const sectionContent = await getSectionContent(result, service);
          contentToShow = sectionContent || result.content;

          // Show section info if available
          const boundary = metadata.boundary as
            | {
                type?: string;
                level?: number;
                title?: string;
              }
            | undefined;
          if (boundary) {
            console.log(
              `   Section: ${boundary.title || boundary.type || "Section"} (Level ${boundary.level || "N/A"})`,
            );
          }
        } else if (showFull) {
          // Get the full original content from the source
          const originalContent = await getOriginalContent(result, service);
          contentToShow = originalContent || result.content;
        } else {
          // Show truncated chunk content
          contentToShow = result.content.substring(0, 200);
        }

        const lines = contentToShow
          .split("\n")
          .map((line: string) => `   | ${line}`);
        console.log(lines.join("\n"));

        if (!showFull && !showSection && result.content.length > 200) {
          console.log("   | ...");
        }

        console.log();
      }

      console.log("Search Statistics:");
      console.log(`  Average Score: ${stats.averageScore.toFixed(3)}`);
      console.log(
        `  Score Range: ${stats.minScore.toFixed(3)} - ${stats.maxScore.toFixed(
          3,
        )}`,
      );

      if (Object.keys(stats.sourceTypes).length > 1) {
        console.log("  Source Types:");
        for (const [type, count] of Object.entries(stats.sourceTypes)) {
          console.log(`    ${type}: ${count}`);
        }
      }
    }
  },
);

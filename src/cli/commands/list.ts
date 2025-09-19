import { basename } from "node:path";
import { analyzeItems } from "../../core/utils/source-analyzer.js";
import { createReadOnlyCommandHandler } from "../utils/command-handler.js";
import { getDBConfig } from "../utils/config-helper.js";

export interface ListContext {
  values: {
    provider?: string;
    db?: string;
    stats?: boolean;
    byExtension?: boolean;
    bySource?: boolean;
    detailed?: boolean;
  };
}

export const handleList = createReadOnlyCommandHandler<ListContext>(
  async (service, ctx) => {
    // Get dbConfig for displaying provider info
    const { config: dbConfig } = await getDBConfig(ctx.values);
    const stats = await service.getStats();

    console.log(`Database Provider: ${dbConfig?.provider || "unknown"}`);
    console.log(`Total chunks: ${stats.totalItems}`);

    // Get all items for comprehensive analysis
    const allItems = await service.listItems({ limit: 10000 });

    // Analyze sources and extensions
    const { sourceMap, extensionMap } = analyzeItems(allItems);

    console.log(`Unique sources: ${sourceMap.size}`);

    if (Object.keys(stats.bySourceType).length > 0) {
      console.log("\nChunks by source type:");
      for (const [type, count] of Object.entries(stats.bySourceType)) {
        if (count > 0) {
          console.log(`  ${type}: ${count}`);
        }
      }
    }

    // Display by extension if requested
    if (ctx.values.byExtension) {
      console.log("\n=== Extension Statistics ===");
      const sortedExtensions = Object.entries(extensionMap).sort(
        (a, b) => b[1].count - a[1].count,
      );

      for (const [ext, data] of sortedExtensions) {
        const lang = data.language ? ` (${data.language})` : "";
        console.log(
          `  ${ext}${lang}: ${data.count} chunks from ${data.sources.size} source(s) [${data.category}]`,
        );
      }
    }

    // Display by source if requested or by default
    if (ctx.values.bySource || (!ctx.values.byExtension && !ctx.values.stats)) {
      console.log("\n=== Sources Summary ===");
      const sortedSources = Array.from(sourceMap.values())
        .sort((a, b) => b.chunks - a.chunks)
        .slice(0, ctx.values.detailed ? undefined : 10);

      for (const source of sortedSources) {
        console.log(
          `\n  ${source.title || basename(source.url || source.sourceId)}`,
        );
        if (source.url) {
          console.log(`    URL: ${source.url}`);
        }
        console.log(`    Type: ${source.sourceType || "unknown"}`);
        console.log(`    Chunks: ${source.chunks}`);

        if (source.extensions.size > 0) {
          const extList = Array.from(source.extensions.entries())
            .map(([ext, count]) => `${ext}(${count})`)
            .join(", ");
          console.log(`    Files: ${extList}`);
        }

        if (source.firstSeen) {
          console.log(`    Indexed: ${source.firstSeen}`);
        }
      }

      if (!ctx.values.detailed && sortedSources.length < sourceMap.size) {
        console.log(
          `\n  ... and ${sourceMap.size - sortedSources.length} more sources (use --detailed to see all)`,
        );
      }
    }
  },
);

import { existsSync } from "node:fs";
import {
  indexFile,
  indexFiles,
  indexGist,
  indexGitHubRepo,
  indexText,
} from "../../core/indexer/indexer.js";
import {
  SecurityError,
  validateFilePath,
} from "../../core/security/security.js";
import { parseCliInteger } from "../utils/arg-parser.js";
import { displayErrors } from "../utils/cli-helpers.js";
import { createWriteCommandHandler } from "../utils/command-handler.js";
import { handleCliError } from "../utils/error-handler.js";
import { createProgressReporter } from "../utils/progress.js";

// Re-export from config-helper for backward compatibility
export { getDBConfig } from "../utils/config-helper.js";

export interface IndexContext {
  values: {
    provider?: string;
    db?: string;
    text?: string;
    file?: string;
    files?: string;
    gist?: string;
    github?: string;
    title?: string;
    url?: string;
    "chunk-size"?: string;
    "chunk-overlap"?: string;
    "preserve-boundaries"?: boolean;
    branch?: string;
    paths?: string;
  };
}

export const handleIndex = createWriteCommandHandler<IndexContext>(
  async (service, ctx) => {
    const values = ctx.values || {};
    const options = {
      chunkSize: parseCliInteger(values["chunk-size"], 1000) ?? 1000,
      chunkOverlap: parseCliInteger(values["chunk-overlap"], 200) ?? 200,
      preserveBoundaries: values["preserve-boundaries"] ?? true,
      onProgress: createProgressReporter("Indexing", (message, progress) => {
        if (progress !== undefined) {
          const percentage = Math.round(progress * 100);
          console.log(`${message} [${percentage}%]`);
        } else {
          console.log(message);
        }
      }),
    };

    let result: Awaited<ReturnType<typeof indexText>>;

    if (ctx.values.text) {
      result = await indexText(
        ctx.values.text,
        {
          title: ctx.values.title,
          url: ctx.values.url,
          sourceType: "text",
        },
        options,
        service,
      );
    } else if (ctx.values.files) {
      // Handle multiple files with glob patterns
      const patterns = ctx.values.files.split(",").map((p) => p.trim());

      result = await indexFiles(
        patterns,
        {
          title: ctx.values.title,
          url: ctx.values.url,
        },
        options,
        service,
      );
    } else if (ctx.values.file) {
      try {
        const filePath = await validateFilePath(ctx.values.file);

        if (!existsSync(filePath)) {
          handleCliError(new Error(`File not found: ${filePath}`));
        }

        result = await indexFile(
          filePath,
          {
            title: ctx.values.title || ctx.values.file,
            url: ctx.values.url,
          },
          options,
          service,
        );
      } catch (error) {
        if (error instanceof SecurityError) {
          handleCliError(
            error,
            "Security error - File access is restricted to prevent unauthorized access",
          );
        }
        throw error;
      }
    } else if (ctx.values.gist) {
      result = await indexGist(ctx.values.gist, options, service);
    } else if (ctx.values.github) {
      const githubOptions = {
        ...options,
        branch: ctx.values.branch || "main",
        paths: ctx.values.paths
          ? ctx.values.paths.split(",").map((p) => p.trim())
          : [""],
      };
      result = await indexGitHubRepo(ctx.values.github, githubOptions, service);
    } else {
      return handleCliError(
        new Error(
          "No content specified. Use --text, --file, --files, --gist, or --github",
        ),
      );
    }

    console.log("\nIndexing Results:");
    console.log(`  Items indexed: ${result.itemsIndexed}`);
    console.log(`  Chunks created: ${result.chunksCreated}`);

    displayErrors(result.errors);
  },
);

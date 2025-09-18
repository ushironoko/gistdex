#!/usr/bin/env node

import { loadEnvironmentVariables } from "../core/utils/env-loader.js";

// Load environment variables with fallback to system environment
loadEnvironmentVariables({ envFilePath: ".env" });

import { cli, define } from "gunshi";
import { generate } from "gunshi/generator";
import packageJson from "../../package.json" with { type: "json" };
import {
  getDBConfig,
  handleIndex as runIndexCommand,
} from "./commands/index.js";
import { handleInfo as runInfoCommand } from "./commands/info.js";
import { handleInit as runInitCommand } from "./commands/init.js";
import { handleList as runListCommand } from "./commands/list.js";
import { handleQuery as runQueryCommand } from "./commands/query.js";
import { showVersion } from "./commands/version.js";
import { handleSpecialFlags } from "./utils/special-flags.js";

// Define common database args used by multiple commands
const dbArgs = {
  provider: {
    type: "string" as const,
    description: "Vector database provider",
  },
  db: {
    type: "string" as const,
    description: "Database configuration path",
  },
} satisfies Record<
  string,
  { type: "string" | "number" | "boolean"; description?: string }
>;

// Define commands
const initCommand = define({
  name: "init",
  description: "Initialize a new Gistdex project with .env and config files",
  args: {},
  examples: `# Initialize Gistdex configuration
$ gistdex init

# Or use the short flag
$ gistdex --init`,
  run: async (ctx) => runInitCommand(ctx.values),
});

const indexArgs = {
  ...dbArgs,
  text: { type: "string" as const, description: "Text content to index" },
  file: { type: "string" as const, description: "Single file to index" },
  files: {
    type: "string" as const,
    description: "Glob patterns for multiple files",
  },
  gist: { type: "string" as const, description: "GitHub Gist URL to index" },
  github: {
    type: "string" as const,
    description: "GitHub repository URL to index",
  },
  "chunk-size": { type: "string" as const, description: "Text chunk size" },
  "chunk-overlap": { type: "string" as const, description: "Chunk overlap" },
  "preserve-boundaries": {
    type: "boolean" as const,
    short: "p",
    description: "Preserve semantic boundaries when chunking",
  },
  title: { type: "string" as const, description: "Custom title for content" },
  url: { type: "string" as const, description: "Source URL metadata" },
  branch: {
    type: "string" as const,
    description: "Git branch for GitHub repos",
  },
  paths: {
    type: "string" as const,
    description: "Comma-separated paths to include",
  },
};

const indexCommand = define({
  name: "index",
  description: "Index content into the database",
  args: indexArgs,
  examples: `# Index a GitHub Gist
$ gistdex index --gist https://gist.github.com/user/abc123

# Index a single file
$ gistdex index --file ./document.md

# Index multiple files with glob patterns
$ gistdex index --files "data/*.md"
$ gistdex index --files "**/*.txt,docs/*.md"

# Index with preserve boundaries for code files
$ gistdex index --file ./code.ts --preserve-boundaries

# Index a GitHub repository
$ gistdex index --github https://github.com/user/repo`,
  run: async (ctx) => {
    await getDBConfig(ctx.values);
    return runIndexCommand({ values: ctx.values });
  },
});

const queryArgs = {
  ...dbArgs,
  "top-k": {
    type: "string" as const,
    short: "k",
    description: "Number of results",
  },
  type: {
    type: "string" as const,
    short: "t",
    description: "Filter by source type",
  },
  hybrid: {
    type: "boolean" as const,
    short: "y",
    description: "Enable hybrid search",
  },
  "no-rerank": {
    type: "boolean" as const,
    short: "n",
    description: "Disable result reranking",
  },
  full: {
    type: "boolean" as const,
    short: "f",
    description: "Show full original source content",
  },
  section: {
    type: "boolean" as const,
    short: "s",
    description:
      "Show full section content for markdown files (mutually exclusive with --full)",
  },
};

const queryCommand = define({
  name: "query",
  description: "Search indexed content using semantic/hybrid search",
  args: queryArgs,
  examples: `# Search indexed content
$ gistdex query "vector search implementation"

# Get more results
$ gistdex query -k 10 "embeddings"

# Use hybrid search
$ gistdex query --hybrid "database optimization"

# Show full original content
$ gistdex query --full "specific search"`,
  run: async (ctx) => runQueryCommand(ctx),
});

const listCommand = define({
  name: "list",
  description: "List all indexed items with metadata",
  args: {
    ...dbArgs,
    stats: { type: "boolean" as const, description: "Show statistics only" },
  },
  examples: `# List all indexed items
$ gistdex list

# Show statistics only
$ gistdex list --stats`,
  run: async (ctx) => runListCommand({ values: ctx.values }),
});

const infoCommand = define({
  name: "info",
  description: "Show database adapter information",
  args: {
    provider: {
      type: "string" as const,
      description: "Vector database provider",
    },
  },
  examples: `# Show database adapter info
$ gistdex info

# Show info for specific provider
$ gistdex info --provider sqlite`,
  run: async (ctx) => runInfoCommand({ values: ctx.values }),
});

const versionCommand = define({
  name: "version",
  description: "Show CLI version",
  args: {},
  examples: `# Show version
$ gistdex version

# Or use flags
$ gistdex --version
$ gistdex -v`,
  run: async () => {
    showVersion();
  },
});

// Create subcommands map for CLI
const subCommands = new Map();

// Add commands using set method
subCommands.set("init", initCommand);
subCommands.set("index", indexCommand);
subCommands.set("query", queryCommand);
subCommands.set("list", listCommand);
subCommands.set("info", infoCommand);
subCommands.set("version", versionCommand);

// Define main command - this will be shown in help
const mainCommand = define({
  name: "gistdex",
  description: "RAG Search System for Gist and GitHub Repositories",
  run: async () => {
    // Show help when no subcommand is provided
    const helpText = await generate(null, mainCommand, {
      name: "gistdex",
      version: packageJson.version,
      description:
        "A CLI tool for indexing and searching content using vector databases",
      subCommands,
    });
    console.log(helpText);
  },
});

// Main entry point

export async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Handle special flags (--help, --version, --mcp, etc.)
  const { handled, shouldExit } = await handleSpecialFlags(args);
  if (handled) {
    if (shouldExit) {
      process.exit(0);
    }
    // If MCP server mode is started, shouldExit is not set, so don't execute CLI
  } else {
    const cliOptions = {
      name: "gistdex",
      version: packageJson.version,
      description:
        "A CLI tool for indexing and searching content using vector databases",
      subCommands,
    };

    // If no arguments provided, add --help flag to show help
    const cliArgs = args.length === 0 ? ["--help"] : args;

    try {
      // Use main command - gunshi will handle command routing and help
      await cli(cliArgs, mainCommand, cliOptions);
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  }
}

// Run main function immediately
// This ensures compatibility with bunx, npx, and direct execution
// Skip automatic execution only when imported by Vitest
if (!process.env.VITEST) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    if (error instanceof Error && error.stack) {
      console.error("Stack trace:", error.stack);
    }
    process.exit(1);
  });
}

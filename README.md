# Gistdex

[![npm version](https://badge.fury.io/js/@ushironoko%2Fgistdex.svg)](https://www.npmjs.com/package/@ushironoko/gistdex)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Semantic search CLI tool for indexing and searching content using vector databases.

Support MCP tools. Gives the your agent the power of Agent in the Loop.

## Documentation

Full documentation: [https://gistdex.vercel.app/](https://gistdex.vercel.app/)

## Quick Start

```bash
# Use without installation
npx @ushironoko/gistdex@latest --help

# Initialize configuration
npx @ushironoko/gistdex@latest init

# Index content
npx @ushironoko/gistdex@latest index --gist https://gist.github.com/username/gist-id
npx @ushironoko/gistdex@latest index --files "src/**/*.ts"

# Search
npx @ushironoko/gistdex@latest query "how to implement authentication"

# CI: Analyze documentation impact from code changes
npx @ushironoko/gistdex@latest ci:doc --diff "main..HEAD" --threshold 0.7
```

## Claude Integration

Add to Claude Code with one command:

```bash
claude mcp add gistdex -- npx @ushironoko/gistdex --mcp
```

## Requirements

- Node.js >= 24.6.0 or Bun >= 1.1.14
- Google AI API key for embeddings ([Get one here](https://makersuite.google.com/app/apikey))

## Features

- **Semantic Search** - Search by meaning using Google's gemini-embedding-001
- **Multi-Source Indexing** - GitHub Gists, repositories, local files, plain text, and supported stdin
- **Local Storage** - SQLite with sqlite-vec extension
- **MCP Support** - Claude integration via Model Context Protocol
- **TypeScript Config** - Type-safe configuration with intellisense
- **Auto Chunk Optimization** - File type-based and CST-based chunk optimize
- **Agent in the Loop MCP** - The agent runs its own query feedback loop to move towards its goal.
- **CI Documentation Analysis** - Analyze documentation impact from code changes in pull requests

## CI Documentation Analysis

Automatically detect which documentation files may need updates when code changes are made. Perfect for maintaining documentation accuracy in CI/CD pipelines.

### Usage

```bash
# Analyze documentation impact from code changes
npx @ushironoko/gistdex@latest ci:doc --diff "main..HEAD"

# With custom threshold (0-1, default 0.7)
npx @ushironoko/gistdex@latest ci:doc --diff "main..HEAD" --threshold 0.5

# Specify documentation paths
npx @ushironoko/gistdex@latest ci:doc --diff "main..HEAD" --paths "docs/**/*.md,README.md"

# Output as JSON for CI integration
npx @ushironoko/gistdex@latest ci:doc --diff "main..HEAD" --format json
```

### GitHub Actions Integration

Use the reusable workflow for easy integration:

**Quick Setup**

1. Create `.github/workflows/doc-impact.yml` in your repository:

```yaml
name: Documentation Impact Analysis

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

jobs:
  analyze-docs:
    uses: ushironoko/gistdex/.github/workflows/reusable-doc-impact.yml@main
    with:
      threshold: "0.6" # Sensitivity (0-1, default: 0.7)
      doc-paths: "docs/**/*.md,README.md" # Document patterns
      node-version: "24" # Node.js version
      gistdex-version: "1.5.0" # Pin Gistdex version
      add-label: true # Add PR label
    secrets:
      GOOGLE_GENERATIVE_AI_API_KEY: ${{ secrets.GOOGLE_GENERATIVE_AI_API_KEY }}
```

2. Add the required secret to your repository:
   - Go to Settings → Secrets and variables → Actions
   - Add `GOOGLE_GENERATIVE_AI_API_KEY` with your API key

That's it! The workflow will automatically:

- Cache dependencies and database for faster runs
- Index your documentation incrementally
- Post analysis results as PR comments
- Upload results as artifacts

**Direct Usage (Alternative):**

```yaml
name: Documentation Impact Analysis

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  analyze-docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Needed for git diff

      - uses: pnpm/action-setup@v4

      - name: Analyze and post to PR
        env:
          GOOGLE_GENERATIVE_AI_API_KEY: ${{ secrets.GOOGLE_GENERATIVE_AI_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          pnpm dlx @ushironoko/gistdex@latest ci:doc \
            --diff "origin/${{ github.base_ref }}...HEAD" \
            --format github-comment \
            --github-pr
```

### Development Setup

```bash
# Clone the repository
git clone https://github.com/ushironoko/gistdex.git
cd gistdex

# Install dependencies
pnpm install

# Run tests
pnpm test

# Build
pnpm build
```

### Development Commands

- `pnpm test` - Run tests
- `pnpm run lint` - Run linter
- `pnpm run format` - Format code
- `pnpm run tsc` - Type check
- `pnpm run dev` - Development mode
- `pnpm run build` - Build for production

## License

MIT © [ushironoko](https://github.com/ushironoko)

## Links

- [Documentation](https://gistdex.vercel.app/)
- [npm Package](https://www.npmjs.com/package/@ushironoko/gistdex)
- [Issue Tracker](https://github.com/ushironoko/gistdex/issues)
- [Changelog](https://github.com/ushironoko/gistdex/releases)

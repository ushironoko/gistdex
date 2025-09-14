# Gistdex

[![npm version](https://badge.fury.io/js/@ushironoko%2Fgistdex.svg)](https://www.npmjs.com/package/@ushironoko/gistdex)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Semantic search CLI tool for indexing and searching content using vector databases.

## Documentation

Full documentation: [https://gistdex.vercel.app/](https://gistdex.vercel.app/)

## Quick Start

```bash
# Use without installation
npx @ushironoko/gistdex --help

# Initialize configuration
npx @ushironoko/gistdex init

# Index content
npx @ushironoko/gistdex index --gist https://gist.github.com/username/gist-id
npx @ushironoko/gistdex index --files "src/**/*.ts"

# Search
npx @ushironoko/gistdex query "how to implement authentication"
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
- **Multi-Source Indexing** - GitHub Gists, repositories, local files, plain text
- **Local Storage** - SQLite with sqlite-vec extension
- **MCP Support** - Claude integration via Model Context Protocol
- **TypeScript Config** - Type-safe configuration with intellisense
- **Auto Chunk Optimization** - File type-based chunk sizing
- **Agent in the Loop** - Interactive query refinement with feedback loops

## Agent in the Loop Architecture

Gistdex provides an Agent in the Loop architecture for LLM-driven iterative search refinement:

### Overview

Instead of automatic execution, the Agent in the Loop pattern allows LLMs to control each search step, evaluate results, and refine queries based on feedback.

### Architecture Flow

```
┌─────────────────────────────────────────────────────────────┐
│                         LLM Agent                            │
│  (Claude / GPT-4 via MCP Client)                            │
└────────┬───────────────────────────────────┬─────────────────┘
         │ 1. Evaluate                       │ 4. Feedback
         ▼                                   ▼
┌─────────────────────────────────────────────────────────────┐
│                    MCP Server Tools                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  • gistdex_evaluate - Evaluate results against goal   │  │
│  │  • gistdex_refine_query - Improve query based on eval │  │
│  │  • gistdex_plan_execute_stage - Execute plan stages  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────────────┘
                      │ 2. Search
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              Vector Database & Search Engine                 │
└─────────────────────┬───────────────────────────────────────┘
                      │ 3. Cache Results
                      ▼
┌─────────────────────────────────────────────────────────────┐
│          Cache Layer (.gistdex/cache/agent/)                │
│  • evaluations/ - Evaluation results                        │
│  • refinements/ - Query refinement history                  │
│  • stages/ - Stage execution results                        │
└──────────────────────────────────────────────────────────────┘
```

### Step-by-Step Process

1. **Initial Query**: Agent executes search with initial query
2. **Evaluation**: Results are evaluated against the goal
   - Confidence score (0-1)
   - Coverage assessment
   - Missing aspects identification
3. **Refinement**: Based on evaluation, query is refined using strategies:
   - `broaden` - Expand scope for more results
   - `narrow` - Focus on specific aspects
   - `pivot` - Change approach entirely
   - `combine` - Merge multiple strategies
4. **Iteration**: Process repeats until satisfactory results or max iterations
5. **Caching**: All steps are cached for learning and analysis

### Example Usage

```typescript
// 1. Search
const results = await gistdex_query("VitePress configuration");

// 2. Evaluate results
const evaluation = await gistdex_evaluate({
  goal: "Understanding VitePress setup",
  query: "VitePress configuration",
  results: results
});
// Returns: { confidence: 0.6, shouldContinue: true, missingAspects: ["themes", "plugins"] }

// 3. Refine query based on evaluation
const refinement = await gistdex_refine_query({
  currentQuery: "VitePress configuration",
  goal: "Understanding VitePress setup",
  missingAspects: ["themes", "plugins"],
  strategy: "broaden"
});
// Returns: { refinedQuery: "VitePress theme plugin customization setup" }

// 4. Search again with refined query
const betterResults = await gistdex_query(refinement.refinedQuery);
```

### Benefits

- **Agent Control**: LLM controls each step instead of automatic execution
- **Feedback Loops**: Continuous improvement based on evaluation
- **Transparency**: Clear reasoning for each decision
- **Flexibility**: Multiple refinement strategies
- **Learning**: Cached results enable pattern analysis
- **Timeout Protection**: 30-second timeout prevents long-running operations

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

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
- [GitHub Repository](https://github.com/ushironoko/gistdex)
- [Issue Tracker](https://github.com/ushironoko/gistdex/issues)
- [Changelog](https://github.com/ushironoko/gistdex/releases)

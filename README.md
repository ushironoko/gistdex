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
```

## Claude Integration

Add to Claude Code with one command:

```bash
claude mcp add gistdex -- npx @ushironoko/gistdex --mcp
```

## Requirements

- Node.js >= 24.6.0 or Bun >= 1.1.14
- Google AI API key for embeddings ([Get one here](https://makersuite.google.com/app/apikey))

## Testing

Gistdex uses Testing Trophy approach for comprehensive test coverage:

```bash
# Run all tests
pnpm test

# Run integration tests
pnpm test tests/integration

# Run with coverage
pnpm test:coverage
```

## Features

- **Semantic Search** - Search by meaning using Google's gemini-embedding-001
- **Multi-Source Indexing** - GitHub Gists, repositories, local files, plain text, and supported stdin
- **Local Storage** - SQLite with sqlite-vec extension
- **MCP Support** - Claude integration via Model Context Protocol
- **TypeScript Config** - Type-safe configuration with intellisense
- **Auto Chunk Optimization** - File type-based and CST-based chunk optimize
- **Agent in the Loop MCP** - The agent runs its own query feedback loop to move towards its goal.

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

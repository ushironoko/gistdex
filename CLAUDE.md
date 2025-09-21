# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

### Core Development Commands

- `pnpm test` - Run unit tests using Vitest
- `pnpm run test:unit` - Run unit tests (same as `pnpm test`)
- `pnpm run test:integration` - Run integration tests and cleanup test directories
- `pnpm run test:integration:build` - Build then run integration tests
- `pnpm run test:all` - Run all tests (unit + integration with build)
- `pnpm run test:watch` - Run tests in watch mode for TDD
- `pnpm run test:coverage` - Run tests with coverage report
- `pnpm run lint` - Run Biome linter (auto-fixes issues)
- `pnpm run format` - Format code with Biome
- `pnpm run tsc` - Type check without emitting files using tsgo
- `pnpm run dev` - Compile TypeScript in watch mode
- `pnpm run build` - Build TypeScript to JavaScript
- `pnpm start` - Run compiled CLI from dist/
- `pnpm run run-all` - Complete check: format, lint, typecheck, unit test, build, and docs build

### Documentation Commands

- `pnpm run docs:dev` - Start VitePress documentation server in development mode
- `pnpm run docs:build` - Build static documentation site with VitePress
- `pnpm run docs:preview` - Preview built documentation site

### CLI Commands

The project provides a CLI tool with the following commands:

- `npx gistdex init` or `npx gistdex --init` - Initialize database
- `npx gistdex index` - Index content from various sources (Gist, GitHub, files, text)
  - `--text "content"` - Index plain text
  - `--file path/to/file` - Index a single file
  - `--files "pattern"` - Index multiple files using glob patterns (comma-separated)
  - `--gist url` - Index a GitHub Gist
  - `--github url` - Index a GitHub repository
  - `--paths "pattern"` - Specify paths or glob patterns for GitHub repos (e.g., `"src/**/*.ts"`, `"**/*.{js,ts}"`)
  - `--branch "branch"` - Specify branch for GitHub repos (default: main)
  - `--chunk-size N` - Set chunk size (default: 1000)
  - `--chunk-overlap N` - Set chunk overlap (default: 200)
- `npx gistdex query` - Search indexed content using semantic/hybrid search
  - `-k, --top-k <n>` - Number of results (default: 5)
  - `-t, --type <type>` - Filter by source type (gist, github, file, text)
  - `-y, --hybrid` - Enable hybrid search (semantic + keyword)
  - `-n, --no-rerank` - Disable result re-ranking
  - `-f, --full` - Show full original source content (automatically retrieves from sourceId)
- `npx gistdex list` - List all indexed items with metadata
  - `--stats` - Show statistics only
- `npx gistdex info` - Show vector database adapter information
- `npx gistdex version` - Show CLI version (also `--version` or `-v`)
- `npx gistdex help` - Display help message
- `npx gistdex --mcp` or `-m` - Start MCP (Model Context Protocol) server for LLM integration

#### CI/CD Commands

- `npx gistdex ci-doc` - Analyze documentation for CI/CD pipeline

#### Examples of Multiple File Indexing

```bash
# Index all TypeScript files in src directory
npx gistdex index --files "src/**/*.ts"

# Index multiple patterns (comma-separated)
npx gistdex index --files "src/**/*.ts,docs/**/*.md,*.json"

# Index with custom chunking parameters
npx gistdex index --files "**/*.md" --chunk-size 2000 --chunk-overlap 200

# Index all JavaScript and TypeScript files recursively
npx gistdex index --files "**/*.{js,ts,jsx,tsx}"
```

#### Examples of GitHub Repository Indexing with Glob Patterns

```bash
# Index only TypeScript files from a GitHub repository
npx gistdex index --github https://github.com/user/repo --paths "**/*.ts"

# Index specific directories with multiple patterns
npx gistdex index --github https://github.com/user/repo --paths "src/**/*.ts,lib/**/*.js"

# Index documentation and source code
npx gistdex index --github https://github.com/user/repo --paths "docs/**/*.md,src/**/*.{ts,tsx}"

# Index from a specific branch
npx gistdex index --github https://github.com/user/repo --branch develop --paths "**/*.py"

# Index root directory only (backward compatibility)
npx gistdex index --github https://github.com/user/repo --paths ""
```

#### Examples of Full Content Retrieval

```bash
# Search and show full original content for each result
npx gistdex query --full "search term"

# Get single result with complete original content as raw output
npx gistdex query -k 1 -f "specific search"

# Combine with other options
npx gistdex query --type gist --full "gist content"
npx gistdex query --hybrid -k 1 -f "exact match"
```

### MCP Server Mode

The project includes an MCP (Model Context Protocol) server that allows LLMs to directly use Gistdex:

```bash
# Start MCP server
npx gistdex --mcp
# or
npx gistdex -m
```

MCP tools available:

- `gistdex_search` - Autonomous agent-based search with strategic planning and execution (PRIMARY TOOL)
- `gistdex_query_simple` - Simple search for indexed content (use only when gistdex_search lacks needed flexibility)
- `gistdex_index` - Index content from various sources
- `gistdex_list` - List indexed items with statistics
- `gistdex_write_structured_result` - Save agent-generated structured analysis and findings
- `gistdex_read_cached` - Read cached queries and structured knowledge from .gistdex/cache directory

#### Agent Search Architecture

The project implements autonomous agent-based search with strategic planning and execution:

1. **Strategic Planning**: `gistdex_search` creates multi-stage query plans based on research goals
2. **Autonomous Execution**: Executes queries strategically with progress tracking and evaluation
3. **Adaptive Refinement**: Automatically evaluates results and decides next actions
4. **Comprehensive Analysis**: Provides detailed analysis and recommendations for complex research tasks
5. **Structured Knowledge**: Agents can save their findings using `gistdex_write_structured_result`
6. **Query Caching**: Successful queries are cached in `.gistdex/cache/` for future reference

This architecture allows LLM agents to:
- Plan and execute complex search strategies autonomously
- Evaluate results and refine queries automatically
- Build structured knowledge through multi-stage research
- Handle complex research tasks requiring multiple search iterations

**重要な開発上の注意事項:**
MCPツールに新しいオプションを追加する際は、以下の3箇所すべての実装が必要：

1. **`src/mcp/server.ts`** - ツール定義のinputSchemaにオプションを追加（ここが最重要！）
2. **`src/mcp/schemas/validation.ts`** - Zodスキーマにオプションを追加
3. **`src/mcp/tools/*-tool.ts`** - 実際の処理ロジックの実装

**調査の優先順位:**
MCPツールの問題を調査する際は、必ず以下の順序で確認すること：
1. まず`src/mcp/server.ts`のツール定義を確認（ここでMCPクライアントに公開される）
2. 次に`validation.ts`のスキーマ定義を確認
3. 最後に実際のツール実装を確認

**型変換の注意:**
MCPプロトコル経由で渡される値は文字列として渡される可能性があるため、
boolean型フィールドにはZodのunion型で適切な変換を実装している：
```typescript
z.union([
  z.boolean(),
  z.string().transform((val) => val === "true" || val === "1"),
  z.number().transform((val) => val !== 0),
])

Configuration for Claude Desktop (Windows) - add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "gistdex": {
      "command": "npx",
      "args": ["--yes", "@ushironoko/gistdex@latest", "--mcp"],
      "env": {
        "GOOGLE_GENERATIVE_AI_API_KEY": "your-api-key",
        "NODE_NO_WARNINGS": "1"
      }
    }
  }
}
```

Note: On Windows, the database will be created at `C:\Users\<username>\AppData\Local\AnthropicClaude\app-*\gistdex.db`
Note: macOS Claude Desktop is not supported due to https://github.com/modelcontextprotocol/servers/issues/1748

## Architecture Overview

### Smart Content Chunking & Retrieval

The system uses an intelligent chunking strategy that:

1. **Indexes with small chunks** (default 1000 chars) for precise semantic search
2. **Preserves original content** by storing it with the first chunk (chunkIndex: 0)
3. **Groups chunks** using unique sourceId for each indexed content
4. **Reconstructs full content** on demand by retrieving all chunks with the same sourceId
5. **Handles overlaps** intelligently when reconstructing from multiple chunks

This approach provides:

- Efficient storage (original content stored once)
- Precise search (small chunks for better matching)
- Complete retrieval (full content available with --full flag)

### Pluggable Vector Database Architecture

The system uses a **functional composition pattern** for vector databases, eliminating global state and ensuring proper resource management:

1. **Core Abstraction**: `VectorDBAdapter` interface in `src/core/vector-db/adapters/types.ts` defines the contract all adapters must implement
2. **Registry System**:
   - `RegistryInterface` and `createRegistry` in `src/core/vector-db/adapters/registry.ts` provide adapter registration
   - `withRegistry` and `withCustomRegistry` in `src/core/vector-db/adapters/registry-operations.ts` enable scoped registry usage
3. **Factory Pattern**: `createFactory` in `src/core/vector-db/adapters/factory.ts` creates adapter instances with registry support
4. **Service Layer**:
   - `createDatabaseService` in `src/core/database/database-service.ts` provides high-level API
   - `createDatabaseOperations` in `src/core/database/database-operations.ts` provides functional composition patterns

### Key Components

#### Vector Database Layer (`src/core/vector-db/`)

- **Built-in Adapters** (`src/core/vector-db/adapters/`):
  - `sqlite-adapter.ts` - SQLite with sqlite-vec extension for local vector storage (uses better-sqlite3 internally)
  - `memory-adapter.ts` - In-memory storage for testing (async factory function)
  - `base-adapter.ts` - Base adapter with common functionality to reduce code duplication
  - `common-operations.ts` - Shared batch operations for adapters
- **Registry System**:
  - `registry.ts` - Core registry implementation with `RegistryInterface` and `createRegistry`
  - `registry-operations.ts` - Functional composition patterns (`withRegistry`, `withCustomRegistry`, `getDefaultRegistry`)
  - `factory.ts` - Factory for creating adapters with registry support
- **Supporting Modules**:
  - `errors.ts` - Custom error types for vector DB operations
  - `utils/filter.ts` - Filter utilities for query operations
  - `utils/validation.ts` - Input validation utilities
  - `constants.ts` - Constants for vector DB operations
- **Extension Points**:
  - New adapters are created as async factory functions returning `Promise<VectorDBAdapter>`
  - Use `withCustomRegistry` for scoped adapter registration
  - Use `withRegistry` for full control over registry lifecycle
  - Template available at `templates/adapter-template.ts`

#### Core Services (`src/core/`)

- **database/** - Database layer
  - `database-service.ts` - Main service orchestrating vector operations through adapters
  - `database-operations.ts` - Functional composition patterns (`withDatabase`, `withReadOnly`, `withTransaction`)
- **embedding/** - Embedding generation
  - `embedding.ts` - Google AI gemini-embedding-001 model integration (768 dimensions)
- **chunk/** - Text chunking and parsing
  - `chunking.ts` - Text chunking with configurable size and overlap
  - `boundary-aware-chunking.ts` - Boundary-preserving chunking for structured content
  - `cst-operations.ts` - Concrete Syntax Tree operations for code parsing
  - `parser-factory.ts` - Parser creation for various file types
- **search/** - Search functionality
  - `search.ts` - Semantic and hybrid search with full content retrieval
  - `security.ts` - Input validation and sanitization
- **indexer/** - Content indexing
  - `indexer.ts` - Multi-source indexing with sourceId generation
  - `indexer-auto-optimize.ts` - Automatic chunk optimization
- **config/** - Configuration management
  - `config.ts` - Configuration loading with functional composition
- **utils/** - Utility functions
  - `env-loader.ts` - Environment variable loading
  - `ranking.ts` - Result re-ranking algorithms
  - `math-utils.ts` - Mathematical operations (cosine similarity, dot product)
  - `config-parser.ts` - Configuration file parsing

#### MCP Layer (`src/mcp/`)

- **server.ts** - MCP server implementation with tool registration and routing
- **tools/** - MCP tool implementations
  - `agent-query-tool.ts` - Autonomous agent-based search (gistdex_search)
  - `query-tool.ts` - Simple query tool (gistdex_query_simple)
  - `index-tool.ts` - Content indexing tool
  - `list-tool.ts` - List indexed items tool
  - `write-structured-tool.ts` - Save structured knowledge tool
  - `read-cached-tool.ts` - Read cached queries and knowledge tool
- **utils/** - MCP utilities
  - `tool-handler.ts` - Factory for creating type-safe tool handlers
  - `metadata-generator.ts` - Analysis metadata generation
  - `query-chain.ts` - Multi-stage query execution
  - `query-cache.ts` - Query result caching
  - `structured-knowledge.ts` - Structured knowledge storage
  - `score-analysis.ts` - Score distribution analysis
  - `stop-words.ts` - Stop word filtering for keywords
  - `cache-utils.ts` - Cache directory management
- **schemas/validation.ts** - Zod schemas for tool input validation

#### CLI Layer (`src/cli/`)

- **index.ts** - Main CLI entry point with Map-based command routing using gunshi framework
- **commands/init.ts** - Database initialization command
- **commands/index.ts** - Content indexing command (exports `getDBConfig` for backward compatibility)
- **commands/query.ts** - Search query command
- **commands/list.ts** - List indexed items command
- **commands/info.ts** - Show adapter information command
- **commands/version.ts** - Show CLI version command
- **commands/ci-doc.ts** - CI documentation analysis command
- **commands/ci-github-comment.ts** - GitHub PR comment posting command
- **utils/command-handler.ts** - Command handler abstraction for common DB operations
- **utils/config-helper.ts** - Configuration helper for loading DB config

### Configuration Flow

1. Check for explicit `--provider` CLI argument
2. Load configuration from multiple sources (priority order):
   - CLI arguments
   - Environment variables
   - Config files (`./gistdex.config.json`, `./.gistdexrc.json`, `~/.gistdex/config.json`)
   - Default values
3. Support for custom adapters via `customAdapters` field in config
4. Configuration structure (`GistdexConfig`):
   - `vectorDB`: Database provider and options
   - `customAdapters`: Map of provider names to adapter file paths
   - `embedding`: Model and dimension settings
   - `indexing`: Chunk size, overlap, and batch settings
   - `search`: Default K, reranking, and hybrid search settings

## Testing Strategy

Tests are colocated with source files using `.test.ts` suffix. Run tests with coverage to ensure 80% threshold is met for branches, functions, lines, and statements.

## Recent Architecture Improvements

### MCP Tool Reorganization (v1.3.7+)

- Renamed and reordered MCP tools for better agent usage:
  - `gistdex_agent_query` → `gistdex_search` (now the primary tool)
  - `gistdex_query` → `gistdex_query_simple` (secondary tool)
- Added `gistdex_write_structured_result` for agent-driven knowledge creation
- Removed automatic structured data generation in favor of agent control
- Cleaned up unused MCP utility functions and files

### MCP Server Integration (v0.5.0+)

- Added Model Context Protocol (MCP) server for LLM integration
- Six MCP tools: `gistdex_search`, `gistdex_query_simple`, `gistdex_index`, `gistdex_list`, `gistdex_write_structured_result`, `gistdex_read_cached`
- Common tool handler factory to eliminate code duplication
- CLI supports `--mcp` flag to start server
- Configurable via `.mcp.json` with `cwd` field for database location

### Environment Variable Loading (v0.4.5+)

- Unified environment loading with `env-loader.ts`
- Fallback from `.env` file to system environment variables
- Shared between CLI and MCP server

### Command Handler Abstraction (v0.3.0+)

- Introduced `createCommandHandler` utility to eliminate code duplication in CLI commands
- All command handlers now use consistent database connection management
- Reduced code duplication by ~12% through abstraction
- Commands use either `createReadOnlyCommandHandler` or `createWriteCommandHandler`

### Version Management

- CLI version is dynamically loaded from package.json
- Version command available via `gistdex version`, `--version`, or `-v`
- Package.json is included in published npm package for runtime access

### Map-based Command Routing

- CLI uses Map for command registration instead of switch statements
- Commands are registered using `subCommands.set()` method
- gunshi framework handles command routing and argument parsing

### SQLite Adapter Modernization (v0.5.5+)

- Replaced node:sqlite with better-sqlite3 for stable SQLite support
- Eliminates experimental SQLite warnings in Node.js 24+
- Maintains full compatibility with sqlite-vec extension for vector operations
- Transparent to users - still accessed as "sqlite" provider
- Dynamic provider selection in config: Linux uses "bun-sqlite", macOS uses "sqlite"

## Important Development Notes

- **Node.js Version**: Must use Node.js 24.2.0+ (see `.node-version`)
- **Package Manager**: Must use pnpm 10.0.0+
- **Module System**: Pure ESM, no CommonJS support
- **TypeScript**: Compiles to JavaScript for execution, uses `.js` extensions in imports for compiled code
- **Error Handling**: All async operations must handle errors properly with cause chains
- **Security**: Input validation required for all user inputs, no secrets in code
- **Function-based Programming**: Function-based coding is strongly recommended. Class-based coding is prohibited in principle
- **Testing**: Vitest with 80% coverage threshold
- **Linting/Formatting**: Biome with minimal customization

## Adding New Vector Database Adapters

### Using Base Adapter (Recommended)

1. Create a `StorageOperations` implementation for your database
2. Use `createBaseAdapter` to get common functionality
3. Register using `withCustomRegistry` for scoped usage

### Direct Implementation

1. Copy `templates/adapter-template.ts` to `src/core/vector-db/adapters/`
2. Create an async factory function that returns `Promise<VectorDBAdapter>`
3. Use one of these registration methods:
   - **Scoped**: Use `withCustomRegistry` for temporary registration
   - **Full Control**: Use `withRegistry` to manage the entire registry
4. Add configuration support in `config-operations.ts` if needed
5. Write comprehensive tests for the adapter (colocated as `my-adapter.test.ts`)
6. Update README.md with adapter documentation

### Factory Function Pattern

Adapters use async factory functions instead of classes:

- Accept `VectorDBConfig` as parameter
- Return `Promise<VectorDBAdapter>`
- Handle async initialization internally
- Encapsulate state using closures
- No global state or singletons

### Configuration Examples

#### Environment Variables

```bash
# Only Google Generative AI API key is supported from environment variables
GOOGLE_GENERATIVE_AI_API_KEY=your-api-key

# All other configurations should be set via config file or CLI arguments
```

#### Configuration Files

Gistdex supports both TypeScript and JSON configuration files, loaded in the following priority:
1. `gistdex.config.ts` (TypeScript - Recommended)
2. `gistdex.config.js` (JavaScript)
3. `gistdex.config.json` (JSON)
4. `.gistdexrc.json` (JSON)
5. `~/.gistdex/config.json` (User config)

##### TypeScript Configuration (gistdex.config.ts)

```typescript
import { defineGistdexConfig } from "@ushironoko/gistdex";
import { platform } from "node:os";

// Linux環境ではbun-sqlite、macOSではsqliteを使用
const provider = platform() === "linux" ? "bun-sqlite" : "sqlite";

export default defineGistdexConfig({
  vectorDB: {
    provider,
    options: {
      path: "./gistdex.db",
      dimension: 768,
    },
  },
  customAdapters: {
    myAdapter: "./adapters/my-adapter.js",
  },
  embedding: {
    model: "gemini-embedding-001",
    dimension: 768,
  },
  indexing: {
    chunkSize: 1000,
    chunkOverlap: 200,
    batchSize: 100,
  },
  search: {
    defaultK: 10,
    enableRerank: true,
    rerankBoostFactor: 1.5,
    hybridKeywordWeight: 0.3,
  },
});
```

##### JSON Configuration (gistdex.config.json)

```json
{
  "vectorDB": {
    "provider": "sqlite",
    "options": {
      "path": "./gistdex.db",
      "dimension": 768
    }
  },
  "customAdapters": {
    "myAdapter": "./adapters/my-adapter.js"
  },
  "embedding": {
    "model": "gemini-embedding-001",
    "dimension": 768
  },
  "indexing": {
    "chunkSize": 1000,
    "chunkOverlap": 200,
    "batchSize": 100
  },
  "search": {
    "defaultK": 10,
    "enableRerank": true,
    "rerankBoostFactor": 1.5,
    "hybridKeywordWeight": 0.3
  }
}
```

## Project Structure

```
gistdex/
├── src/
│   ├── cli/           # CLI implementation
│   │   ├── index.ts   # Main CLI entry with gunshi framework
│   │   ├── commands/  # Individual command handlers
│   │   │   ├── init.ts     # Initialize database
│   │   │   ├── index.ts    # Index content (with getDBConfig export)
│   │   │   ├── query.ts    # Search content
│   │   │   ├── list.ts     # List indexed items
│   │   │   ├── info.ts     # Show adapter info
│   │   │   ├── version.ts  # Show CLI version
│   │   │   ├── ci-doc.ts   # CI documentation analysis
│   │   │   └── ci-github-comment.ts # GitHub PR comment
│   │   └── utils/     # CLI utilities
│   │       ├── command-handler.ts  # Command abstraction
│   │       ├── config-helper.ts    # Config loading
│   │       ├── arg-parser.ts       # Argument parsing
│   │       ├── error-handler.ts    # Error handling
│   │       └── progress.ts         # Progress reporting
│   ├── mcp/           # MCP server implementation
│   │   ├── server.ts  # MCP server with StdioServerTransport
│   │   ├── tools/     # MCP tool handlers
│   │   │   ├── agent-query-tool.ts # Agent-based search via MCP
│   │   │   ├── index-tool.ts  # Index content via MCP
│   │   │   ├── query-tool.ts  # Search via MCP
│   │   │   ├── list-tool.ts   # List items via MCP
│   │   │   ├── write-structured-tool.ts # Save structured knowledge
│   │   │   └── read-cached-tool.ts # Read cached content
│   │   ├── utils/     # MCP utilities
│   │   │   └── tool-handler.ts # Tool handler factory
│   │   └── schemas/   # Validation schemas
│   │       └── validation.ts   # Zod schemas
│   ├── core/          # Core business logic
│   │   ├── vector-db/ # Vector database layer
│   │   │   ├── adapters/   # Database adapters
│   │   │   │   ├── sqlite-adapter.ts  # SQLite implementation
│   │   │   │   ├── memory-adapter.ts  # In-memory implementation
│   │   │   │   ├── base-adapter.ts    # Base adapter functionality
│   │   │   │   ├── registry.ts        # Adapter registry
│   │   │   │   ├── factory.ts         # Adapter factory
│   │   │   │   └── types.ts           # TypeScript types
│   │   │   └── utils/      # Utility functions
│   │   ├── database-service.ts    # Main service
│   │   ├── database-operations.ts # Functional operations
│   │   ├── config-operations.ts   # Configuration management
│   │   ├── embedding.ts           # Embedding generation
│   │   ├── chunking.ts            # Text chunking
│   │   ├── search.ts              # Search implementation
│   │   ├── indexer.ts             # Content indexing
│   │   ├── security.ts            # Security utilities
│   │   └── utils/                 # Core utilities
│   │       ├── env-loader.ts      # Environment variable loader
│   │       ├── ranking.ts         # Search result ranking
│   │       └── config-parser.ts   # Config parsing
│   └── index.ts       # Library entry point
├── templates/         # Adapter templates
├── docs/             # Documentation
├── data/             # Default data directory
└── dist/             # Compiled JavaScript output
```

## Important Development Notes

- **Version Management**: NEVER modify the version in package.json manually. Version is automatically updated by CI/CD workflow during release

## Documentation

あなたはこのリポジトリのドキュメントサイトの作成に、vitepress を利用します。`./gistdex.db` には vitepress に関するすべての情報がインデックスされています。以下の手順を厳守し、vitepress に関する正確な情報をクエリする必要があります。

1. ユーザーの指示を適切にクエリキーワードにし、gistdex.db へクエリする。この時 `--full` オプションは使わず、`llms-full.txt` のチャンク情報のみを得る
2. 1.で得られた情報を元に、`llms.txt` にリストされた URL を取得する
3. 2.で得られた URL へ `gemini-google-search` mcp を用いてウェブアクセスし、情報を取得する

これらの手順は必ず守る必要があります。ユーザーへ都度、手順を守っていることを報告する義務があります。

## Coding Rules

コーディングを行う際は、以下の点を遵守する必要があります。

### 必須開発サイクル

1. t_wada の推奨する TDD の開発サイクルに従って進める
2. TODO リストを作成し、順番に取り組む
3. 適切なタイミングで lint,typecheck,test,format を実行する
4. スクリプトの実行は常に pnpm コマンドを使う

### 守るべき TypeScript の規約

#### as any や as unknown キャストの禁止

これらは型安全性を著しく損なうため禁止。

#### class 構文の禁止

class 構文は禁止し、関数とクロージャを利用した関数合成をベースに設計する。また、シングルトンになる変数の export も禁止されている。

#### テストファイルでの型の積極的な活用

テストファイル内でアサーションに使う値は、`as const satisfies XXX` のように型を用いて適切に行う。

## Testing Guidelines

### Testing Trophy Strategy

The project follows the Testing Trophy approach with the following test distribution:

```
       ／￣￣￣＼
      ／  Manual  ＼     (5%)
     ／    E2E     ＼    (15%)
    ／ Integration  ＼   (60%) ← Primary focus
   ／     Unit      ＼  (20%)
  ￣￣￣￣￣￣￣￣￣￣
```

### Test Types

1. **Unit Tests (20%)**
   - Pure function logic tests
   - No mocking allowed
   - Utility functions, calculation logic

2. **Integration Tests (60%)**
   - Multi-module interaction tests
   - Use real database (in-memory)
   - API endpoint tests

3. **E2E Tests (15%)**
   - Complete user scenario execution
   - CLI command execution tests
   - MCP server integration tests

4. **Manual Tests (5%)**
   - Visual verification
   - Debugging purposes

### Test Helpers

```typescript
// tests/helpers/test-db.ts
import { createTestDatabase } from "../helpers/test-db.js";

// Use in-memory database
const db = await createTestDatabase({ provider: "memory" });

// Use temporary SQLite (when persistence needed)
const db = await createTestDatabase({
  provider: "sqlite",
  persistData: false  // Auto-cleanup after test
});
```

### Test Fixtures

```typescript
// tests/helpers/test-fixtures.ts
import { testDocuments, testCode, testQueries } from "../helpers/test-fixtures.js";

// Use common test data
const doc = testDocuments.typescript;
const code = testCode.python;
```

### Assertion Helpers

```typescript
// tests/helpers/test-utils.ts
import {
  assertSearchResultValid,
  assertEmbeddingValid,
  withTimeout
} from "../helpers/test-utils.js";

// Execute test with timeout
const result = await withTimeout(
  longRunningOperation(),
  30000,
  "Operation timed out"
);
```

### Integration Test Patterns

#### Full Flow Testing

```typescript
describe("Index → Search Flow", () => {
  it("should index and retrieve content", async () => {
    const db = await createTestDatabase();

    // Index
    await indexText("TypeScript content", {}, {}, db);

    // Search
    const results = await semanticSearch("TypeScript", { k: 5 }, db);

    // Verify results
    expect(results[0].content).toContain("TypeScript");
  });
});
```

#### Error Handling Testing

```typescript
it("should handle errors gracefully", async () => {
  const db = await createTestDatabase();

  // Empty content
  const result = await indexText("", {}, {}, db);
  expect(result.errors.length).toBeGreaterThan(0);

  // Database continues to work normally
  const count = await db.countItems();
  expect(count).toBe(0);
});
```

#### Concurrent Operations Testing

```typescript
it("handles concurrent operations", async () => {
  const db = await createTestDatabase();

  // Execute multiple operations concurrently
  const operations = [
    indexText("Doc 1", {}, {}, db),
    indexText("Doc 2", {}, {}, db),
    indexText("Doc 3", {}, {}, db),
  ];

  const results = await Promise.all(operations);

  // Verify all succeeded
  results.forEach(r => {
    expect(r.itemsIndexed).toBeGreaterThan(0);
  });
});
```

### Best Practices

#### DO ✅

1. **Use real components**
   - Leverage in-memory DB and temporary files

2. **Keep tests independent**
   - Create new DB instance for each test
   - Clean up in afterEach

3. **Write meaningful assertions**
   - Verify actual behavior
   - Check side effects

4. **Set appropriate timeouts**
   - Add timeouts for long-running operations

#### DON'T ❌

1. **Excessive mocking**
   - Keep to minimum
   - Only mock external APIs

2. **Depend on implementation details**
   - Test behavior, not internal implementation

3. **Large test files**
   - Split by feature
   - Group related tests

### Migration Strategy

Current state: 757 mock usages → Target: <100 mock usages

The goal is to reduce mocking and achieve:
- Integration test coverage: 60%
- Bug detection rate: 80%+
- Test execution time: <3 minutes
- Reduced test creation time: 30% decrease

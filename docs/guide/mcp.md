# MCP Integration

Gistdex implements a Model Context Protocol (MCP) server for integration with Claude, allowing it to index and search content during conversations.

## What is MCP?

Model Context Protocol (MCP) is a protocol for AI assistants to interact with external tools. Gistdex exposes its indexing and search functions as MCP tools.

## Claude Desktop Integration (Windows)

### Configuration

Add the following to your Claude Desktop's `claude_desktop_config.json`:

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

### Database Location

On Windows, the database file (`gistdex.db`) will be created at:
```
C:\Users\<username>\AppData\Local\AnthropicClaude\app-*\
```

### Platform Support

- **Windows**: ✅ Fully supported
- **macOS**: ❌ Not supported (see [issue #1748](https://github.com/modelcontextprotocol/servers/issues/1748))
- **Linux**: ✅ Claude Code supported

## Claude Code Integration

### Quick Setup

Add Gistdex to Claude Code:

```bash
claude mcp add gistdex -- npx @ushironoko/gistdex@latest --mcp
```

This configures Gistdex as an MCP server without global installation.

## Available MCP Tools

When Gistdex is available, Claude Code has access to five MCP tools:

### 1. `gistdex_search` (Primary Tool)
Intelligent search with automatic query planning and comprehensive analysis.
- Provides automatic query strategy planning based on research goals
- Includes metadata analysis, strategic hints, and next action recommendations
- Features automatic goal tracking, coverage analysis, and quality assessment
- Supports three response modes:
  - `summary` (default, ~5K tokens)
  - `detailed` (~15K tokens)
  - `full` (may exceed limits)
- Can save findings as structured knowledge for future reference

### 2. `gistdex_query_simple` (Low-level Tool)
Manual search with direct control over parameters.
- Provides fine-grained control over search behavior
- Configurable options:
  - `hybrid`: Enable hybrid search for keyword + semantic matching
  - `rerank`: Enable/disable result reranking
  - `section`: Return complete sections for markdown files
  - `full`: Return entire original content
- Supports filtering by source type (gist, github, file, text)
- Can include metadata analysis and strategic hints

### 3. `gistdex_index`
Indexes content from various sources with intelligent chunking:
- Supported content types: text, files, GitHub Gists, GitHub repositories
- Configurable chunking parameters:
  - `chunkSize`: Size of text chunks (default: 1000)
  - `chunkOverlap`: Overlap between chunks (default: 200)
  - `preserveBoundaries`: Maintains semantic structure (default: true)
- Boundary preservation features:
  - For markdown: maintains heading hierarchy
  - For code: respects function/class boundaries
- Supports batch indexing with glob patterns for files

### 4. `gistdex_list`
Lists indexed items with optional filtering:
- Shows all indexed content with metadata
- `stats=true`: Returns only statistics about the database
- Supports filtering by source type (gist, github, file, text)
- Configurable pagination with limit parameter
- Displays source URLs, chunk counts, and indexing timestamps

### 5. `gistdex_write_structured_result`
Saves analysis and findings as structured knowledge:
- Creates permanent knowledge artifacts from research results
- Accepts markdown-formatted content with sections, headings, lists, and code blocks
- Optional metadata fields:
  - `goal`: Original research goal or question
  - `query`: Main search query used
  - `summary`: Brief one-paragraph summary
  - `tags`: Categories for organization
- Saves to `.gistdex/cache/structured` by default (customizable)

## Result Caching

MCP tools support result caching for improved context reuse:

### Cache Location
Results are stored in `.gistdex/cache/` directory:
- Structured knowledge: `.gistdex/cache/structured/`
- Query cache: `.gistdex/cache/queries/`

### How Caching Works
- `gistdex_search` and `gistdex_query_simple` can save results with `saveStructured: true`
- `gistdex_write_structured_result` explicitly saves analysis as knowledge artifacts
- Cached results persist across sessions, enabling incremental knowledge building
- Cache files are in markdown format for easy review and editing

## MCP Server Mode

You can also run Gistdex as a standalone MCP server:

```bash
# Start MCP server
npx @ushironoko/gistdex --mcp
# or
npx @ushironoko/gistdex -m
```

This starts the server using StdioServerTransport, which communicates via standard input/output.

## Benefits

- Search indexed content directly in Claude Code conversations
- Persistent knowledge base across sessions
- Natural language queries with semantic understanding
- No context switching between tools

## Troubleshooting

See [Troubleshooting Guide](../reference/troubleshooting.md#mcp-issues) for MCP-specific issues.

## See Also

- [Getting Started](./getting-started.md)
- [Configuration](./configuration.md)
- [CLI Reference](../reference/cli.md)
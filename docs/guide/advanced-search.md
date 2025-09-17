# Advanced Search

This guide covers advanced search features available in Gistdex through MCP integration.

## Agent Query (MCP Only)

The `gistdex_agent_query` tool provides autonomous multi-stage search capabilities for complex research tasks. It is available only through MCP integration with Claude.

### How It Works

1. **Query Analysis**: Analyzes the research goal and initial query
2. **Strategic Planning**: Creates a multi-stage search strategy
3. **Iterative Execution**: Executes queries with progress tracking
4. **Result Evaluation**: Evaluates results and determines next actions
5. **Recommendations**: Provides analysis and actionable suggestions

### Response Modes

The agent supports three response modes:

- **summary** (default): Concise overview (~5K tokens)
- **detailed**: Results with analysis (~15K tokens)
- **full**: Complete information (may exceed token limits)

### Key Features

#### Query Analysis
- Determines query complexity and specificity
- Identifies ambiguous terms
- Detects query type (factual, exploratory, navigational)

#### Semantic Analysis
- Topic clustering across results
- Coverage gap identification
- Redundancy detection
- Diversity scoring

#### Next Action Suggestions
The agent provides suggestions for:
- **refine**: Add missing coverage
- **broaden**: Expand search scope
- **pivot**: Try different perspectives
- **stop**: Sufficient results found
- **index_more**: Need more content

### Result Caching

Agent query results can be cached in `.gistdex/cache/` for future reference when `saveStructured` option is enabled.

## Query Chain (MCP Only)

Query chains execute multiple search strategies automatically through the MCP `gistdex_query` tool.

### Chain Stages

When `useChain` is enabled:

1. **Semantic Search**: Initial meaning-based search
2. **Hybrid Search**: Combines semantic with keyword matching
3. **Extended Concept Search**: Explores related concepts

### Structured Knowledge

With `saveStructured` enabled:
- Results are saved to `.gistdex/cache/`
- Enables knowledge reuse across sessions
- Improves context for future queries

## Section-Aware Search

For markdown documents, Gistdex can retrieve complete sections:

### How It Works

When using `--section` flag or `section: true` in MCP:

1. Finds relevant chunks within markdown files
2. Identifies the containing section boundaries
3. Returns the complete section with heading hierarchy
4. Preserves document structure and context

### Use Cases

- Documentation search
- Tutorial content retrieval
- README exploration
- Knowledge base queries

### Example

```bash
# CLI usage
npx @ushironoko/gistdex query --section "installation"
```

Returns the entire "Installation" section including all subsections.

## Search Strategies

### Multi-Stage Research

For complex topics, use multiple queries:

1. **Broad exploration**: Start with general terms
2. **Refinement**: Focus on specific aspects found
3. **Gap filling**: Search for missing information
4. **Verification**: Confirm findings with targeted queries

### Combining Search Options

```bash
# Hybrid search with full content
npx @ushironoko/gistdex query --hybrid --full "specific implementation"

# Section retrieval with more results
npx @ushironoko/gistdex query --section -k 10 "api reference"
```

## Performance Considerations

### Token Usage

- Agent queries analyze multiple results
- Use `summary` mode for initial exploration
- Switch to `detailed` or `full` for deep dives

### Search Speed

- Semantic search is fastest
- Hybrid search adds keyword matching overhead
- Re-ranking improves relevance but adds latency
- Use `--no-rerank` for speed when order isn't critical

## See Also

- [Basic Searching](./searching.md)
- [MCP Integration](./mcp.md)
- [CLI Reference](../reference/cli.md)
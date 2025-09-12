# Gistdex MCP Best Practices

## Overview

This document describes best practices for using Gistdex through the Model Context Protocol (MCP) to achieve optimal search results and efficient knowledge management.

## Core Principles

### 1. Preserve Semantic Structure

**Always use `preserveBoundaries=true` when indexing content**

- For markdown files: Maintains heading hierarchy and section boundaries
- For code files: Respects function and class boundaries
- For structured data: Preserves logical groupings

```json
{
  "type": "file",
  "file": { "path": "docs/api.md" },
  "preserveBoundaries": true,
  "chunkSize": 2000
}
```

### 2. Multi-Stage Query Strategy

Use a progressive refinement approach for complex searches:

#### Stage 1: Broad Discovery (Hybrid Search)

Start with hybrid search to discover relevant domains and keywords.

```json
{
  "query": "authentication system",
  "hybrid": true,
  "k": 10
}
```

#### Stage 2: Focused Semantic Search

Use pure semantic search on specific topics identified in Stage 1.

```json
{
  "query": "JWT token validation in auth middleware",
  "hybrid": false,
  "k": 5
}
```

#### Stage 3: Section Retrieval for Markdown

For markdown content, use `section=true` to get complete sections.

```json
{
  "query": "API authentication endpoints",
  "section": true,
  "k": 3
}
```

**Note**: `section` and `full` options are mutually exclusive. Use `section` for markdown content to get complete semantic sections.

### 3. Optimize Chunk Sizes by Content Type

Different content types benefit from different chunk sizes:

- **Documentation (`.md`)**: 2000-3000 characters
  - Larger chunks preserve context and narrative flow
- **Source Code (`.ts`, `.js`, `.py`)**: 500-1000 characters
  - Smaller chunks for precise function/method retrieval
- **Configuration (`.json`, `.yaml`)**: 300-500 characters
  - Very small chunks for specific settings

### 4. Leverage Query Caching

The system automatically caches successful queries to:

- Speed up repeated searches
- Build incremental knowledge
- Track successful query patterns

Cached queries are stored in:
- `.gistdex/cache/queries.json` - Structured query data
- `.gistdex/cache/queries.md` - Human-readable format
- `.gistdex/cache/results/` - Structured search results

### 5. Build Structured Knowledge Incrementally

Combine results from multiple queries to build comprehensive understanding:

1. Start with broad searches to map the domain
2. Follow up with specific queries for details
3. Use section retrieval for complete documentation
4. Save structured results for future reference

## Common Query Patterns

### Documentation Search Pattern

```javascript
// Stage 1: Find relevant documentation areas
{
  "query": "user authentication",
  "hybrid": true,
  "k": 15
}

// Stage 2: Get specific API details
{
  "query": "login endpoint request response",
  "hybrid": false,
  "k": 5
}

// Stage 3: Retrieve complete sections
{
  "query": "authentication flow diagram",
  "section": true,
  "k": 3
}
```

### Code Search Pattern

```javascript
// Stage 1: Find relevant code files
{
  "query": "UserController class",
  "hybrid": true,
  "k": 10
}

// Stage 2: Find specific methods
{
  "query": "validateUser authentication logic",
  "hybrid": false,
  "k": 5
}
```

### Configuration Search Pattern

```javascript
// Find configuration settings
{
  "query": "database connection settings",
  "hybrid": true,
  "k": 5,
  "type": "file"  // Filter by source type
}
```

## Indexing Best Practices

### 1. Index Incrementally

Don't re-index content that hasn't changed. Use `gistdex_list` with `stats=true` to check what's already indexed.

### 2. Use Appropriate Metadata

Add metadata to help with filtering and organization:

```json
{
  "type": "github",
  "github": {
    "url": "https://github.com/user/repo",
    "metadata": {
      "project": "backend",
      "version": "2.0.0",
      "category": "api"
    }
  }
}
```

### 3. Batch Related Content

Index related content together to maintain semantic relationships:

```json
{
  "type": "files",
  "files": {
    "pattern": "docs/**/*.md",
    "metadata": {
      "category": "documentation"
    }
  },
  "preserveBoundaries": true,
  "chunkSize": 2000
}
```

## Query Optimization Tips

### 1. Use Appropriate K Values

- **Broad searches**: k=10-20 for comprehensive coverage
- **Focused searches**: k=3-5 for specific results
- **Section retrieval**: k=1-3 for complete sections

### 2. Leverage Reranking

Reranking is enabled by default and improves result relevance. Only disable for speed if you have many results:

```json
{
  "query": "search term",
  "rerank": false,  // Only for performance optimization
  "k": 50
}
```

### 3. Use Type Filters

Filter by source type to narrow results:

```json
{
  "query": "configuration",
  "type": "gist",  // Only search in gists
  "k": 5
}
```

## Advanced Techniques

### 1. Combining Full and Section Retrieval

- Use `full=true` when you need the complete original document
- Use `section=true` for markdown when you need a complete semantic section
- Never use both together (they're mutually exclusive)

### 2. Building Knowledge Graphs

Create structured knowledge by:

1. Indexing with rich metadata
2. Using multi-stage queries
3. Saving results with relationships
4. Building connections between queries

### 3. Query Templates

Create reusable query templates for common searches:

```javascript
// API Documentation Query Template
const apiDocQuery = (endpoint) => ({
  query: `${endpoint} API documentation request response`,
  hybrid: true,
  section: true,
  k: 3
});

// Use template
apiDocQuery("POST /auth/login");
```

## Troubleshooting

### Poor Search Results

1. Check if content is properly indexed with `preserveBoundaries=true`
2. Try hybrid search first for keyword matching
3. Increase k value for more results
4. Check chunk size appropriateness for content type

### Slow Queries

1. Reduce k value if you don't need many results
2. Disable reranking for large result sets
3. Use type filters to reduce search space
4. Check if similar queries are cached

### Missing Content

1. Verify indexing completed successfully
2. Check chunk boundaries with `preserveBoundaries`
3. Try using `full=true` for complete content
4. Use `section=true` for markdown sections

## Summary

By following these best practices, you can:

- Achieve more accurate search results
- Build structured knowledge incrementally
- Optimize query performance
- Maintain semantic relationships in indexed content

Remember: Start broad with hybrid search, refine with semantic search, and use section retrieval for complete markdown sections.
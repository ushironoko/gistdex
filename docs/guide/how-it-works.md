# How Gistdex Works

Technical overview of Gistdex's architecture and content processing.

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│                    User Interface                     │
│                   (CLI / MCP Server)                  │
└────────────────────┬─────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────┐
│                  Command Handler                      │
│              (Routing & Validation)                   │
└────────────────────┬─────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────┐
│                 Database Service                      │
│        (createDatabaseService factory function)       │
└────────────────────┬─────────────────────────────────┘
                     │
         ┌───────────┴───────────┬──────────────┐
         │                       │              │
┌────────▼────────┐   ┌─────────▼──────┐   ┌──▼──────┐
│    Indexer      │   │     Search     │   │  List   │
│                 │   │                │   │         │
└────────┬────────┘   └────────┬───────┘   └──┬──────┘
         │                     │               │
┌────────▼────────────────────▼───────────────▼───────┐
│                  Core Components                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Chunking │  │Embedding │  │ Vector DB Adapter│  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
└──────────────────────────────────────────────────────┘
```

## The Indexing Pipeline

### 1. Content Acquisition

Gistdex starts by fetching content from various sources:

- **Local Files**: Read directly from filesystem
- **GitHub Gists**: Fetched via GitHub API
- **GitHub Repos**: Cloned and processed
- **Plain Text**: Accepted directly as input

```typescript
// Simplified flow - actual implementation in src/core/indexer.ts
const content = await readFile(filePath, "utf-8");
// or for Gists/GitHub
const response = await fetch(url);
const content = await response.text();
```

### 2. Content Chunking

Large documents are split into smaller, overlapping chunks for efficient semantic search. Gistdex provides multiple chunking strategies optimized for different content types.

#### Chunking Approaches

##### Standard Text Chunking

For regular text and documentation, `chunkText()` splits by character count:

```typescript
// From src/core/chunking.ts
const chunks = chunkText(text, {
  size: 1000, // characters per chunk
  overlap: 200, // overlapping characters
});
```

Example:

```
Original: "The quick brown fox jumps over the lazy dog"
         ↓
Chunks (size=20, overlap=5):
  [1] "The quick brown fox "
  [2] "n fox jumps over the"
  [3] " the lazy dog"
```

##### Semantic Boundary Preservation (`--preserve-boundaries`)

When enabled, Gistdex uses specialized parsers to maintain semantic boundaries:

**For Markdown Files (.md, .mdx)**

Uses a custom Markdown parser that:

- Identifies headings, code blocks, lists, and paragraphs
- Keeps related content together (e.g., heading with its content)
- Preserves complete sections when possible
- Splits at line boundaries if section exceeds maxChunkSize

**For Code Files (Tree-sitter supported)**

Uses Tree-sitter CST (Concrete Syntax Tree) parsing that:

- Parses code into a syntax tree
- Identifies functions, classes, and other constructs
- Splits at semantic boundaries (function/class boundaries)
- If a function/class exceeds maxChunkSize, splits at line boundaries with overlap

Supported languages:

- JavaScript/TypeScript (.js, .jsx, .ts, .tsx, .mjs, .mts, .cjs)
- Python (.py)
- Go (.go)
- Rust (.rs)
- Ruby (.rb)
- C/C++ (.c, .cpp, .h)
- Java (.java)
- HTML (.html)
- CSS/SCSS/Sass (.css, .scss, .sass)
- Bash/Shell (.sh, .bash)

#### Configuration Options

##### Automatic Optimization (Default)

When chunk size and overlap are not specified, Gistdex automatically optimizes based on file type:

| File Type     | Auto Chunk Size | Auto Overlap | Extensions                    |
| ------------- | --------------- | ------------ | ----------------------------- |
| Code          | 650             | 130          | .js, .ts, .py, .go, .rs, etc. |
| Documentation | 1250            | 250          | .md, .mdx                     |
| Articles      | 1750            | 350          | .txt, .html                   |
| Default       | 1000            | 200          | All other files               |

```bash
# Let Gistdex auto-optimize (recommended)
npx @ushironoko/gistdex index --file code.js
# Automatically uses: chunk-size 650, overlap 130
```

##### Manual Configuration

Override automatic optimization when needed:

```bash
# Force specific settings
npx @ushironoko/gistdex index --chunk-size 2000 --chunk-overlap 400 --file doc.md

# Enable semantic boundaries
npx @ushironoko/gistdex index --preserve-boundaries --file code.py
# Or use shorthand
npx @ushironoko/gistdex index -p --file code.js
```

#### Examples

**Markdown with preserve-boundaries:**

````markdown
# Configuration Guide ← Heading section starts

This section explains... ← Kept with heading

## Database Setup ← New section boundary

Configure your database... ← New section content

```sql ← Code block treated as section
CREATE TABLE users (
  id INTEGER PRIMARY KEY
);
```
````

**Code with preserve-boundaries:**

```javascript
// Standard chunking (might split mid-function):
Chunk 1: "function processUser(data) {\n  validateDa"
Chunk 2: "ta(data);\n  return saveUser(data);\n}\n\nfunc"

// With preserve-boundaries (keeps functions intact):
Chunk 1: "function processUser(data) {\n  validateData(data);\n  return saveUser(data);\n}"
Chunk 2: "function validateData(data) {\n  if (!data.name) throw new Error();\n}"
```

#### Trade-offs

**Using `--preserve-boundaries`:**

- ✅ More accurate search results (complete semantic units)
- ✅ Better context preservation
- ⚠️ 3-5x more chunks than standard chunking
- ⚠️ More embeddings to generate and store
- ⚠️ Higher processing time

### 3. Embedding Generation

Each chunk is converted to a numerical vector using `generateEmbeddingsBatch()`:

```typescript
// From src/core/embedding.ts
const embeddings = await generateEmbeddingsBatch(chunks);
// Returns: Array of 768-dimensional vectors
```

Example:

```
"The quick brown fox" → [0.124, -0.892, 0.567, ...] (768 dimensions)
```

These vectors capture semantic meaning:

- Similar concepts have similar vectors
- Distance between vectors represents semantic similarity

### 4. Vector Storage

Embeddings are stored in SQLite with sqlite-vec extension:

```sql
-- Simplified schema
CREATE TABLE chunks (
  id INTEGER PRIMARY KEY,
  source_id TEXT,
  chunk_index INTEGER,
  content TEXT,
  embedding BLOB  -- 768-dimensional vector
);

CREATE INDEX vec_idx ON chunks(embedding);
```

### 5. Metadata Preservation

Each chunk maintains metadata:

- `sourceId`: Links chunks from the same document
- `chunkIndex`: Preserves order
- `type`: Source type (gist, file, etc.)
- `metadata`: Additional info (title, URL, etc.)

## The Search Process

### 1. Query Processing

Your search query undergoes the same embedding process:

```
"error handling" → [0.234, -0.678, 0.445, ...] (768 dimensions)
```

### 2. Vector Similarity Search

The query vector is compared against all stored vectors:

```sql
-- Conceptual query (actual uses sqlite-vec functions)
SELECT content, vec_distance(embedding, query_vector) as score
FROM chunks
ORDER BY score ASC
LIMIT k;
```

### 3. Distance Metrics

Gistdex uses cosine similarity to measure vector distance:

```
similarity = (A · B) / (||A|| × ||B||)
```

- **1.0**: Identical meaning
- **0.0**: Unrelated
- **-1.0**: Opposite meaning (rare in practice)

### 4. Result Re-ranking

Optional re-ranking improves result quality:

1. Initial semantic search finds candidates
2. Re-ranking considers additional factors:
   - Term frequency
   - Chunk position
   - Source relevance

### 5. Content Reconstruction

For full content display, the original content is retrieved:

```typescript
// When --full flag is used (actual function from src/core/search.ts)
const fullContent = await getOriginalContent(result, service);
```

## Hybrid Search

When `--hybrid` is enabled, Gistdex combines semantic and keyword matching:

```typescript
// From src/core/search.ts
const results = await hybridSearch(query, {
  keywordWeight: 0.3, // 30% weight for keyword matching
  k: 10, // Number of results
});
```

### How It Works

1. **Performs semantic search first** - Gets vector similarity results
2. **Counts word matches** - Checks how many query words appear in each result
3. **Calculates hybrid score**:
   ```
   hybridScore = (semanticScore × 0.7) + (wordMatchScore × 0.3)
   ```

### What It Actually Does

- **Word extraction**: Splits query into lowercase words
- **Simple matching**: Checks if words exist in content (case-insensitive)
- **Score blending**: Combines semantic and keyword scores with configurable weight

### Limitations

- **NOT a full-text search** - Just simple word matching
- **No stemming** - "running" won't match "run"
- **No phrase search** - Can't search for exact phrases
- **Case-insensitive only** - No case-sensitive option

## Agent in the Loop (MCP Only)

The Agent in the Loop feature provides intelligent search analysis and recommendations through MCP (Model Context Protocol) integration. Think of it as having a research assistant that analyzes your search results and suggests how to improve your queries for better results.

### Why Agent in the Loop?

When you search for information manually, you rarely find everything in a single query. Instead, you:
1. Start with a broad search to understand the landscape
2. Identify promising directions from initial results
3. Refine your search based on what you learned
4. Continue until you have enough information

Agent in the Loop provides intelligent analysis and recommendations to guide this search process.

### How It Works

```
User's Research Goal
    ↓
Agent Analyzes the Goal and Query
    ↓
Executes Search
    ↓
Evaluates Results
    ↓
Provides Analysis and Recommendations
    ↓
Suggests Next Actions
```

### The Core Steps

#### Step 1: Goal Analysis

When the agent receives a research goal like "How to implement JWT authentication in Node.js", it first breaks down what you're looking for:

- **Keywords extracted**: JWT, authentication, Node.js, implementation
- **Query type identified**: Implementation guide (not just theory)
- **Complexity assessed**: Moderate (specific technology + specific framework)
- **Language detected**: English

This analysis helps the agent understand not just what to search for, but how to approach the search.

#### Step 2: Search Execution

The agent executes the search using the provided query and goal, applying semantic or hybrid search based on the configuration. The search leverages the existing Gistdex index to find relevant content.

#### Step 3: Result Evaluation

After each search, the agent evaluates the results using multiple metrics:

- **Score Quality**: How relevant are the results? (0.8+ is high quality)
- **Coverage**: Do we have all the information we need?
- **Diversity**: Are we getting different perspectives or just duplicates?
- **Gaps**: What's still missing?

Example evaluation:
```
Average Score: 0.75 (good)
Coverage: Partial (missing error handling examples)
Diversity: 0.6 (moderate variety)
Gap Identified: "JWT refresh token implementation"
```

#### Step 4: Recommendation Generation

Based on the evaluation, the agent suggests what to do next:

- **refine**: Need more specific information
  - Example: "JWT authentication" → "JWT refresh token Node.js"

- **broaden**: Current search too narrow
  - Example: "Express JWT middleware" → "Node.js authentication"

- **pivot**: Try a different angle
  - Example: "JWT implementation" → "JWT security best practices"

- **stop**: Found sufficient information
  - Triggered when score > 0.8 and coverage is complete

- **index_more**: Need more data in the index
  - Suggested when fewer than 3 results found

### Real-World Example

Let's see how the agent analyzes a search for "How to handle database migrations in production":

```
Query: "database migrations production"
Goal: "How to handle database migrations in production"

Results Found: 8 matches (avg score: 0.72)

Analysis:
  - Found general migration strategies
  - Some production-specific content
  - Missing rollback procedures
  - Low coverage on testing strategies

Recommendations:
  1. refine: "database migration rollback production" (confidence: 0.85)
  2. refine: "database migration testing strategies" (confidence: 0.75)
  3. broaden: "database deployment best practices" (confidence: 0.65)

The agent suggests these follow-up queries to fill the identified gaps.
```

### Internal Analysis Features

The agent uses sophisticated analysis to understand both queries and results:

#### Query Analysis

```typescript
{
  complexity: "moderate",        // simple | moderate | complex
  specificity: 0.7,              // 0-1, how specific is the query
  ambiguity: ["production"],     // potentially unclear terms
  queryType: "exploratory",      // factual | exploratory | navigational
  estimatedIntent: "User wants to learn safe migration practices"
}
```

#### Semantic Analysis

The agent clusters results by topic and identifies patterns:

```typescript
{
  topicClusters: [
    {
      topic: "migration tools",
      resultIndices: [0, 2, 3],
      coherenceScore: 0.85
    },
    {
      topic: "rollback strategies",
      resultIndices: [1, 4],
      coherenceScore: 0.79
    }
  ],
  coverageGaps: ["testing migrations"],
  redundancy: 0.3,  // low redundancy is good
  diversityIndex: 0.7  // good variety of perspectives
}
```

#### Content Characteristics

The agent analyzes what type of content it's finding:

```typescript
{
  predominantType: "documentation",  // code | documentation | discussion
  technicalLevel: "intermediate",
  hasExamples: true,
  hasExplanations: true,
  averageLength: 1250  // characters per result
}
```

### Response Modes

Choose the appropriate mode based on your needs:

#### Summary Mode (Default)
- **Size**: ~5,000 tokens
- **Use for**: Initial exploration, quick understanding
- **Contains**: Key findings, main topics, primary recommendation

#### Detailed Mode
- **Size**: ~15,000 tokens
- **Use for**: Thorough research, implementation planning
- **Contains**: Full analysis, all recommendations, strategic considerations

#### Full Mode
- **Size**: No limit (may exceed token limits)
- **Use for**: Complete information capture
- **Contains**: Everything, including all metadata and internal analysis

### Progress Tracking

The agent tracks progress toward your research goal:

```typescript
{
  goalAlignment: 0.8,        // How well results match the goal
  estimatedCompletion: 0.7,  // Progress estimate
  achievedMilestones: [
    "Found relevant content",
    "Identified high-quality matches",
    "Covered main aspects"
  ],
  missingPieces: ["Performance optimization tips"],
  suggestedNextMilestone: "Find performance best practices"
}
```

### Result Caching

Agent query results are cached for efficiency and knowledge building:

```
.gistdex/
  └── cache/
      ├── agent/
      │   └── query-[timestamp].json  # Individual query results
      └── knowledge/
          └── structured-[topic].json   # Organized knowledge by topic
```

Benefits of caching:
- Avoid repeating expensive searches
- Build cumulative knowledge over time
- Enable cross-session learning
- Faster responses for similar queries

### Practical Use Cases

#### Technical Research
Finding comprehensive information about a new technology:
- Agent starts broad, then narrows to specific use cases
- Identifies authoritative sources vs. community discussions
- Highlights implementation patterns and pitfalls

#### Troubleshooting
Investigating error messages or bugs:
- Begins with exact error matching
- Broadens to similar issues if needed
- Pivots to root causes and solutions
- Identifies related problems to watch for

#### Best Practices Discovery
Learning optimal implementation approaches:
- Searches for established patterns
- Compares different approaches
- Identifies trade-offs and considerations
- Finds real-world examples

#### Documentation Creation
Gathering information for comprehensive docs:
- Ensures complete coverage of topics
- Identifies gaps in existing documentation
- Finds examples and edge cases
- Collects different perspectives

### When to Use Agent Query

**Good for:**
- Complex research questions requiring analysis and recommendations
- Exploring unfamiliar topics where you need guidance on search strategy
- Understanding gaps in your current search results
- Situations where you need help refining your queries

**Not ideal for:**
- Simple, direct lookups
- When you know exactly what you're looking for
- When you don't need search strategy guidance
- Single-fact verification

### Understanding the Results

When the agent completes, it provides:

1. **Summary**: What was found and its relevance
2. **Analysis**: Quality metrics and coverage assessment
3. **Recommendations**: Suggested next actions
4. **Strategic Considerations**: Important factors to consider
5. **Potential Problems**: Identified issues or gaps

This comprehensive output helps you understand not just what was found, but how confident you can be in the results and what else you might need to investigate.

## Performance Features

### 1. Batch Processing

Embeddings are generated in batches to reduce API calls:

```typescript
// Batch processing (actual function from src/core/embedding.ts)
const embeddings = await generateEmbeddingsBatch(texts, {
  batchSize: 100, // Process 100 texts at a time
  onProgress: (processed, total) => {
    console.log(`Processed ${processed}/${total}`);
  },
});
```

This reduces API calls and improves throughput when indexing large amounts of content.

### 2. Database Optimizations

- **Indexed columns**: Fast lookups on source_id, created_at, and vector fields
- **Vector indexing**: sqlite-vec provides optimized vector similarity search
- **Foreign key relationships**: Efficient source-to-chunk mapping

### 3. Efficient Storage

- **Embeddings stored once**: Vectors are persisted in SQLite database
- **Configuration caching**: Settings loaded once per session
- **Source deduplication**: Original content stored once, even with multiple chunks

## Data Flow Example

Let's trace a complete index and search operation:

### Indexing Flow

```
1. User runs: npx @ushironoko/gistdex index --file README.md
   ↓
2. CLI parses arguments, loads config
   ↓
3. README.md content is read (2000 chars)
   ↓
4. Content split into chunks using chunkText():
   - Chunk 1: chars 0-1000 (with overlap)
   - Chunk 2: chars 800-1800
   - Chunk 3: chars 1600-2000
   ↓
5. generateEmbeddingsBatch() → 768-dim vectors
   ↓
6. service.saveItems() stores in SQLite with sourceId
   ↓
7. Success confirmation to user
```

### Search Flow

```
1. User runs: npx @ushironoko/gistdex query "installation steps"
   ↓
2. generateEmbedding() converts query to vector
   ↓
3. semanticSearch() or hybridSearch() executed
   ↓
4. Top-K results retrieved via service.searchItems()
   ↓
5. Optional rerankResults() applied
   ↓
6. If --full flag: getOriginalContent() retrieves full text
   ↓
7. Results formatted and displayed
```

## Security Features

### API Key Protection

- Stored in `.env` file or environment variable
- Masked during input (shows `*` characters)
- Never logged in console output

### Path Security

- Path traversal protection (`..` patterns blocked)
- Restricted to current working directory
- System directories blocked (/etc, /root, etc.)
- Symbolic link validation

### URL Restrictions

- Only GitHub and Gist URLs allowed for remote indexing
- Other domains blocked for security

### Data Privacy

- All processing is local
- No telemetry or analytics
- Database stored locally

## Extensibility

### Custom Vector Database Adapters

You can create custom adapters for different storage backends:

```typescript
// Create your adapter (see templates/adapter-template.ts)
export const createMyAdapter = async (config): Promise<VectorDBAdapter> => {
  return {
    initialize: async () => {
      /* ... */
    },
    insert: async (doc) => {
      /* ... */
    },
    search: async (embedding, options) => {
      /* ... */
    },
    // ... other required methods
  };
};
```

Register in configuration:

```json
{
  "customAdapters": {
    "my-adapter": "./path/to/my-adapter.js"
  },
  "vectorDB": {
    "provider": "my-adapter"
  }
}
```

### Currently Available Adapters

- **SQLite** (default) - Local file-based storage with sqlite-vec
- **Bun-SQLite** - SQLite adapter optimized for Bun runtime (use with `VECTOR_DB_PROVIDER=bun-sqlite`)
- **Memory** - In-memory storage for testing
- **Custom** - Create your own using the adapter template

## See Also

- [Configuration](./configuration.md)
- [CLI Reference](../reference/cli.md)

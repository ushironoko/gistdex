# Configuration

Gistdex can be configured through multiple methods. This guide covers configuration options and precedence.

## Configuration Precedence

Configuration is loaded in the following order (highest to lowest priority):

1. **Command-line arguments** - Override all other settings
2. **Configuration files** - TypeScript or JSON configuration files
3. **Default values** - Built-in defaults

## Configuration Files

Gistdex supports both TypeScript and JSON configuration files. The configuration files are loaded in the following priority order:

1. `gistdex.config.ts` - TypeScript configuration (Recommended for type safety)
2. `gistdex.config.js` - JavaScript configuration
3. `gistdex.config.json` - JSON configuration
4. `.gistdexrc.json` - Alternative JSON configuration
5. `~/.gistdex/config.json` - User global configuration

### TypeScript Configuration (Recommended)

Create `gistdex.config.ts` in your project root for type-safe configuration:

```typescript
import { defineGistdexConfig } from "@ushironoko/gistdex";

export default defineGistdexConfig({
  vectorDB: {
    provider: "sqlite", // or "bun-sqlite", "duckdb", "memory"
    options: {
      path: "./gistdex.db",
      dimension: 768,
    },
  },
  embedding: {
    model: "gemini-embedding-001",
    dimension: 768,
  },
  indexing: {
    chunkSize: 1000,
    chunkOverlap: 200,
    batchSize: 100,
    preserveBoundaries: false,
  },
  search: {
    defaultK: 10,
    enableRerank: true,
    rerankBoostFactor: 1.5,
    hybridKeywordWeight: 0.3,
  },
});
```

The `defineGistdexConfig` helper provides full TypeScript intellisense and type checking for your configuration.

### JSON Configuration

Alternatively, create `gistdex.config.json` in your project root:

```json
{
  "vectorDB": {
    "provider": "sqlite",
    "options": {
      "path": "./gistdex.db",
      "dimension": 768
    }
  },
  "embedding": {
    "model": "gemini-embedding-001",
    "dimension": 768
  },
  "indexing": {
    "chunkSize": 1000,
    "chunkOverlap": 200,
    "batchSize": 100,
    "preserveBoundaries": false
  },
  "search": {
    "defaultK": 10,
    "enableRerank": true,
    "rerankBoostFactor": 1.5,
    "hybridKeywordWeight": 0.3
  }
}
```

## Environment Variables

Only the Google Generative AI API key is supported via environment variables:

```bash
# Required for embedding generation
export GOOGLE_GENERATIVE_AI_API_KEY=your-api-key
```

All other settings must be configured via configuration file or CLI arguments.

### .env File

The `.env` file is created when you run `gistdex init` and provide an API key. It contains only your Google AI API key:

```bash
# .env (created by gistdex init)
GOOGLE_GENERATIVE_AI_API_KEY=your-api-key-here
```

::: tip
If you leave the API key empty during `gistdex init`, the `.env` file will be skipped and you'll need to set `GOOGLE_GENERATIVE_AI_API_KEY` as an environment variable.
:::

If you need to update your API key, edit the `.env` file directly or set the environment variable.

## Configuration Schema

### Field Descriptions

#### vectorDB

- `provider`: Database adapter to use (`sqlite`, `bun-sqlite`, `duckdb`, `memory`, or custom)
  - `sqlite`: Standard SQLite adapter (Node.js) with sqlite-vec extension
  - `bun-sqlite`: SQLite adapter optimized for Bun runtime
  - `duckdb`: DuckDB adapter with HNSW index support for better performance on large datasets
  - `memory`: In-memory storage for testing
- `options`: Provider-specific options
  - `path`: Database file location (SQLite/Bun-SQLite/DuckDB)
  - `dimension`: Vector dimensions (must match embedding model)
  - `customSqlitePath`: Path to standalone SQLite binary (required for Bun on macOS, e.g., `/opt/homebrew/bin/sqlite`)
  - `enableHNSW`: enable HNSW (default: false)
  - `hnswMetric`: Distance metric for DuckDB (default: `cosine`, options: `cosine`, `l2sq`, `ip`)
  - `hnswPersistence`: Enable HNSW for disk-based databases. See the [DuckDB documentation](https://duckdb.org/docs/stable/core_extensions/vss.html#limitations) for more details (default: false)

#### customAdapters

- Map of custom adapter names to their file paths
- Allows using custom vector database implementations

#### embedding

- `model`: Google AI embedding model name (gemini-embedding-001 or text-embedding-004)
- `dimension`: Vector dimensions (768 default, max 3072 for gemini-embedding-001)

#### indexing

- `chunkSize`: Maximum characters per chunk (auto-optimized based on file type if not specified)
- `chunkOverlap`: Characters shared between adjacent chunks
- `batchSize`: Number of chunks to process at once
- `preserveBoundaries`: Enable semantic boundary preservation for code files (uses AST/CST parsing)

#### search

- `defaultK`: Default number of results to return
- `enableRerank`: Whether to re-rank results for better accuracy
- `rerankBoostFactor`: Multiplier for re-ranking scores
- `hybridKeywordWeight`: Balance between semantic and keyword search (0-1)

## Automatic Chunk Optimization

When `chunkSize` and `chunkOverlap` are not explicitly specified, Gistdex automatically optimizes these values based on file type:

- **Code files** (.js, .ts, .py, etc.): 650 chars chunk, 130 chars overlap
- **Documentation** (.md, .mdx): 1250 chars chunk, 250 chars overlap
- **Articles/Text** (.txt, .html): 1750 chars chunk, 350 chars overlap
- **Default**: 1000 chars chunk, 200 chars overlap

## Command-Line Overrides

Command-line arguments override all other configuration:

```bash
# Override chunk size for this command only
npx @ushironoko/gistdex index --chunk-size 2000 --chunk-overlap 500 --file document.md

# Enable preserve boundaries for semantic chunking
npx @ushironoko/gistdex index --preserve-boundaries --file code.js
# Or use shorthand
npx @ushironoko/gistdex index -p --file code.js

# Override search settings
npx @ushironoko/gistdex query -k 10 --no-rerank "search query"
```

## Configuration Examples

### For Code Projects

```typescript
import { defineGistdexConfig } from "@ushironoko/gistdex";

export default defineGistdexConfig({
  vectorDB: {
    provider: "sqlite",
    options: {
      path: "./codebase.db",
      dimension: 768,
    },
  },
  indexing: {
    preserveBoundaries: true, // Enable AST/CST-based chunking
    // chunkSize and chunkOverlap will be auto-optimized
  },
  search: {
    defaultK: 10,
    enableRerank: true,
  },
});
```

### For Documentation

```typescript
import { defineGistdexConfig } from "@ushironoko/gistdex";

export default defineGistdexConfig({
  vectorDB: {
    provider: "sqlite",
    options: {
      path: "./docs.db",
      dimension: 768,
    },
  },
  indexing: {
    chunkSize: 1500,
    chunkOverlap: 300,
    preserveBoundaries: false,
  },
  search: {
    defaultK: 5,
    hybridKeywordWeight: 0.4, // Increase keyword weight for docs
  },
});
```

### For Large Datasets (DuckDB)

```typescript
import { defineGistdexConfig } from "@ushironoko/gistdex";

export default defineGistdexConfig({
  vectorDB: {
    provider: "duckdb", // Use DuckDB for better performance
    options: {
      path: "./large-dataset.duckdb",
      dimension: 768,
      enableHNSW: true, // Enable HNSW indexing for better performance
      hnswMetric: "cosine", // Distance metric (cosine, l2sq, ip)
      hnswPersistence: false, // Enable if you need persistent HNSW index
    },
  },
  indexing: {
    batchSize: 500, // Larger batches for DuckDB
  },
  search: {
    defaultK: 20,
    enableRerank: true,
  },
});
```

### For Testing

```typescript
import { defineGistdexConfig } from "@ushironoko/gistdex";

export default defineGistdexConfig({
  vectorDB: {
    provider: "memory", // In-memory storage
    options: {
      dimension: 768,
    },
  },
});
```

## Best Practices

### Security

- **Never commit API keys** - Use environment variables or `.env` files
- Add `.env` to `.gitignore`
- Use different API keys for development and production

### Performance

- **Chunk Size**: Let Gistdex auto-optimize or use:
  - 500-700 chars for code
  - 1000-1500 chars for documentation
  - 1500-2000 chars for articles
- **Overlap**: 10-20% of chunk size is usually optimal
- **Preserve Boundaries**: Enable for code files to maintain semantic integrity

### Storage

- **Database Location**: Use absolute paths in production
- **Backup**: Regular backups of your `.db` file
- **Permissions**: Ensure write permissions for database directory

## Custom Adapters

Register custom vector database adapters by specifying the path to your adapter file:

```typescript
import { defineGistdexConfig } from "@ushironoko/gistdex";

export default defineGistdexConfig({
  customAdapters: {
    "my-adapter": "./path/to/my-adapter.js",
  },
  vectorDB: {
    provider: "my-adapter",
    options: {
      // Adapter-specific options
    },
  },
});
```

Custom adapters must export an async factory function that returns a `VectorDBAdapter` interface. See `/templates/adapter-template.ts` for implementation details.

## Troubleshooting

See [Troubleshooting Guide](../reference/troubleshooting.md) for common issues.

## See Also

- [CLI Reference](../reference/cli.md)
- [Getting Started](./getting-started.md)

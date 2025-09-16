# TypeScript API Reference

Gistdex can be used as a TypeScript library in addition to the CLI.

## Installation

```bash
npm install @ushironoko/gistdex
```

## Configuration

### defineGistdexConfig

Type-safe configuration helper:

```typescript
import { defineGistdexConfig } from "@ushironoko/gistdex";

export default defineGistdexConfig({
  vectorDB: {
    provider: "sqlite",
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
    defaultK: 5,
    enableRerank: true,
    rerankBoostFactor: 1.5,
    hybridKeywordWeight: 0.3,
  },
});
```

## Core API

### Database Service

Create and manage the database service:

```typescript
import { createDatabaseService } from "@ushironoko/gistdex";

const service = await createDatabaseService({
  provider: "sqlite",
  options: {
    path: "./gistdex.db",
  },
});

// Initialize database
await service.initialize();

// Use the service
const results = await service.search(query, { k: 5 });

// Clean up
await service.close();
```

### Database Operations

Functional composition pattern for database operations:

```typescript
import { createDatabaseOperations } from "@ushironoko/gistdex";

const operations = createDatabaseOperations(config);

// Use with database
await operations.withDatabase(async (db) => {
  const results = await db.search(query);
  return results;
});
```

## Indexing

### Index Functions

```typescript
import {
  indexText,
  indexFile,
  indexGist,
  indexGitHubRepo,
} from "@ushironoko/gistdex";

// Index plain text
await indexText("Content to index", {
  title: "My Document",
  chunkSize: 1000,
}, service);

// Index a file
await indexFile("./document.md", {
  chunkSize: 1000,
  preserveBoundaries: true,
}, service);

// Index a GitHub Gist
await indexGist("https://gist.github.com/user/id", {}, service);

// Index a GitHub repository
await indexGitHubRepo("https://github.com/user/repo", {
  branch: "main",
  paths: ["src", "docs"],
}, service);
```

### IndexOptions

```typescript
interface IndexOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  preserveBoundaries?: boolean;
  metadata?: Record<string, unknown>;
}
```

## Searching

### Search Functions

```typescript
import { semanticSearch, hybridSearch } from "@ushironoko/gistdex";

// Semantic search
const semanticResults = await semanticSearch(
  "search query",
  { k: 10, rerank: true },
  service
);

// Hybrid search (semantic + keyword)
const hybridResults = await hybridSearch(
  "search query",
  { k: 10, sourceType: "file" },
  service
);
```

### SearchOptions

```typescript
interface SearchOptions {
  k?: number;                  // Number of results
  sourceType?: string;          // Filter by type
  rerank?: boolean;             // Enable re-ranking
}
```

## Custom Adapters

### Creating a Custom Adapter

```typescript
import {
  createBaseAdapter,
  type StorageOperations,
  type VectorDBAdapter,
} from "@ushironoko/gistdex";

// Define storage operations
const storageOps: StorageOperations = {
  async insertDocument(doc) {
    // Custom insert logic
  },
  async searchDocuments(embedding, options) {
    // Custom search logic
    return [];
  },
  async getDocument(id) {
    // Custom get logic
    return null;
  },
  async deleteDocument(id) {
    // Custom delete logic
    return false;
  },
  async listDocuments(options) {
    // Custom list logic
    return [];
  },
  async close() {
    // Cleanup
  },
};

// Create adapter using base functionality
export async function createMyAdapter(): Promise<VectorDBAdapter> {
  return createBaseAdapter(storageOps);
}
```

### Registering Custom Adapters

```typescript
import { withCustomRegistry } from "@ushironoko/gistdex";

// Register and use custom adapter
await withCustomRegistry(
  { myAdapter: "./adapters/my-adapter.js" },
  async (registry) => {
    const factory = createFactory(registry);
    const adapter = await factory.createAdapter({
      provider: "myAdapter",
      options: {},
    });
    // Use adapter
  }
);
```

## Types

### Core Types

```typescript
// Document for indexing
interface VectorDocument {
  id: string;
  content: string;
  embedding: number[];
  metadata?: DocumentMetadata;
}

// Search result
interface VectorSearchResult {
  id: string;
  content: string;
  score: number;
  metadata?: DocumentMetadata;
}

// Document metadata
interface DocumentMetadata {
  title?: string;
  url?: string;
  sourceType?: string;
  sourceId?: string;
  chunkIndex?: number;
  totalChunks?: number;
  boundary?: {
    type?: string;
    level?: number;
    title?: string;
  };
  [key: string]: unknown;
}
```

### Configuration Types

```typescript
interface GistdexConfig {
  vectorDB: {
    provider: string;
    options?: Record<string, unknown>;
  };
  embedding?: {
    model: string;
    dimension: number;
  };
  indexing?: {
    chunkSize: number;
    chunkOverlap: number;
    batchSize: number;
    preserveBoundaries: boolean;
  };
  search?: {
    defaultK: number;
    enableRerank: boolean;
    rerankBoostFactor: number;
    hybridKeywordWeight: number;
  };
  customAdapters?: Record<string, string>;
}
```

## Error Handling

### Custom Error Types

```typescript
import {
  VectorDBError,
  DatabaseNotInitializedError,
  DocumentNotFoundError,
  InvalidDimensionError,
} from "@ushironoko/gistdex";

try {
  await service.search(query);
} catch (error) {
  if (error instanceof DatabaseNotInitializedError) {
    // Handle uninitialized database
  } else if (error instanceof VectorDBError) {
    // Handle general vector DB error
  }
}
```

## Advanced Features

### Chunking with CST

```typescript
import { chunkTextWithCST } from "@ushironoko/gistdex";

// Chunk code preserving syntax boundaries
const chunks = await chunkTextWithCST(
  codeContent,
  {
    maxChunkSize: 2000,
    overlap: 200,
  },
  "typescript"
);
```

## Example Usage

### Complete Example

```typescript
import {
  createDatabaseService,
  indexFile,
  semanticSearch,
} from "@ushironoko/gistdex";

async function main() {
  // Create service
  const service = await createDatabaseService({
    provider: "sqlite",
    options: { path: "./my-index.db" },
  });

  // Initialize
  await service.initialize();

  // Index content
  await indexFile("./docs/README.md", {
    chunkSize: 1000,
    preserveBoundaries: true,
  }, service);

  // Search
  const results = await semanticSearch(
    "installation instructions",
    { k: 5, rerank: true },
    service
  );

  // Process results
  for (const result of results) {
    console.log(`Score: ${result.score}`);
    console.log(`Content: ${result.content}`);
  }

  // Cleanup
  await service.close();
}

main().catch(console.error);
```

## See Also

- [Configuration Guide](../guide/configuration.md)
- [CLI Reference](./cli.md)
- [Getting Started](../guide/getting-started.md)
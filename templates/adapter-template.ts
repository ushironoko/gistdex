/**
 * Template for creating a new vector database adapter
 * Follow the hierarchical architecture pattern
 *
 * Architecture Overview:
 * - base-adapter.ts: Core functionality (used by all adapters)
 * - base-[db]-adapter.ts: Database-specific shared features (optional)
 * - [implementation]-adapter.ts: Runtime/platform-specific implementation
 *
 * To create a new adapter:
 * 1. Copy this template to src/core/vector-db/adapters/your-adapter.ts
 * 2. Implement StorageOperations interface
 * 3. Use createBaseAdapter for common functionality
 * 4. Register your adapter for use
 */

import type { StorageOperations } from "../src/core/vector-db/adapters/base-adapter.js";
import { createBaseAdapter } from "../src/core/vector-db/adapters/base-adapter.js";
import type {
  VectorDBAdapter,
  VectorDBConfig,
  VectorDocument,
  VectorSearchResult,
} from "../src/core/vector-db/adapters/types.js";
import { VectorDBError } from "../src/core/vector-db/errors.js";

/**
 * Step 1: Create StorageOperations implementation
 * This contains all database-specific logic
 */
const createYourStorageOperations = (
  _config: VectorDBConfig,
): StorageOperations => {
  // Initialize your database connection here
  // const client = new YourDatabaseClient(config.options);

  // Track state using closures
  let _isOpen = true;

  return {
    async storeDocument(_doc: VectorDocument): Promise<string> {
      // Implementation for storing a document
      // Return the document ID
      throw new Error("storeDocument not implemented");
    },

    async retrieveDocument(_id: string): Promise<VectorDocument | null> {
      // Retrieve document by ID
      throw new Error("retrieveDocument not implemented");
    },

    async removeDocument(_id: string): Promise<void> {
      // Delete document by ID
      throw new Error("removeDocument not implemented");
    },

    async searchSimilar(
      _embedding: number[],
      _options?: { k?: number; filter?: Record<string, unknown> },
    ): Promise<VectorSearchResult[]> {
      // Vector similarity search implementation
      // Return results with scores
      throw new Error("searchSimilar not implemented");
    },

    async countDocuments(_filter?: Record<string, unknown>): Promise<number> {
      // Count documents matching filter
      throw new Error("countDocuments not implemented");
    },

    async listDocuments(_options?: {
      limit?: number;
      offset?: number;
      filter?: Record<string, unknown>;
    }): Promise<VectorDocument[]> {
      // List documents with pagination
      throw new Error("listDocuments not implemented");
    },

    async cleanup(): Promise<void> {
      // Clean up resources (close connections, etc.)
      _isOpen = false;
      // await client.close();
    },
  };
};

/**
 * Step 2: Create adapter using base-adapter
 * This is your main export
 */
export const createYourAdapter = async (
  config: VectorDBConfig,
): Promise<VectorDBAdapter> => {
  // Validate configuration
  const requiredOption = config.options?.requiredOption;
  if (!requiredOption) {
    throw new VectorDBError("Required option is missing for YourAdapter");
  }

  try {
    // Create storage operations
    const storage = createYourStorageOperations(config);

    // Create adapter using base implementation
    return createBaseAdapter(
      {
        dimension: Number(config.options?.dimension) || 768,
        provider: "your-adapter",
        version: "1.0.0",
        capabilities: [
          "vector-search",
          "metadata-filtering",
          // Add your adapter's capabilities
        ],
      },
      storage,
    );
  } catch (error) {
    throw new VectorDBError(
      `Failed to create YourAdapter: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
};

// Factory function for async consistency
export default createYourAdapter;

/**
 * Registration Examples:
 *
 * Method 1: Using withCustomRegistry (Recommended for scoped usage):
 * ```typescript
 * import { withCustomRegistry } from "@ushironoko/gistdex";
 * import { createYourAdapter } from "./your-adapter";
 *
 * await withCustomRegistry(
 *   new Map([["your-adapter", createYourAdapter]]),
 *   async (registry) => {
 *     const adapter = await registry.create({
 *       provider: "your-adapter",
 *       options: { ... }
 *     });
 *     // Use adapter...
 *   }
 * );
 * ```
 *
 * Method 2: Configuration file (gistdex.config.ts):
 * ```typescript
 * export default {
 *   vectorDB: {
 *     provider: "your-adapter",
 *     options: { ... }
 *   },
 *   customAdapters: {
 *     "your-adapter": "./path/to/your-adapter.js"
 *   }
 * };
 * ```
 */

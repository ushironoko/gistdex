import { randomUUID } from "node:crypto";
import { createFactory } from "../vector-db/adapters/factory.js";
import type {
  VectorDBAdapter,
  VectorDocument,
  VectorSearchResult,
} from "../vector-db/adapters/types.js";

export interface ItemMetadata {
  // Source identification
  sourceId?: string;
  sourceType?: "gist" | "github" | "file" | "text";

  // Content chunking
  chunkIndex?: number;
  totalChunks?: number;
  originalContent?: string;

  // Boundary information for structured content (e.g., markdown sections)
  boundary?: {
    type: string;
    level?: number;
    name?: string;
    title?: string;
  };

  // Document information
  title?: string;
  url?: string;
  description?: string;

  // File-specific metadata
  filePath?: string;

  // GitHub-specific metadata
  owner?: string;
  repo?: string;
  branch?: string;
  path?: string;

  // Gist-specific metadata
  gistId?: string;

  // Timestamps
  createdAt?: string;

  // Allow additional properties for extensibility
  [key: string]: unknown;
}

export interface SaveItemParams {
  content: string;
  embedding: number[];
  metadata?: ItemMetadata;
}

export interface SearchParams {
  embedding: number[];
  k?: number;
  sourceType?: string;
}

/**
 * Database service that uses the vector database adapter
 */
/**
 * Creates a standardized VectorDocument with metadata and timestamp
 */
const createDocument = ({
  content,
  embedding,
  metadata = {},
}: {
  content: string;
  embedding: number[];
  metadata?: ItemMetadata;
}): VectorDocument => ({
  id: randomUUID(),
  content,
  embedding,
  metadata: {
    ...metadata,
    createdAt: new Date().toISOString(),
  },
});

/**
 * Wraps adapter operations with standardized error handling
 */
const withErrorHandling = async <T>(
  operation: () => Promise<T>,
  errorMessage: string,
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    throw new Error(errorMessage, { cause: error });
  }
};

/**
 * Type definition for the database service interface
 */
export interface DatabaseService {
  initialize: (
    config?: Parameters<ReturnType<typeof createFactory>["create"]>[0],
  ) => Promise<void>;
  saveItem: (params: SaveItemParams) => Promise<string>;
  saveItems: (items: SaveItemParams[]) => Promise<string[]>;
  searchItems: (params: SearchParams) => Promise<VectorSearchResult[]>;
  countItems: (filter?: Record<string, unknown>) => Promise<number>;
  listItems: (options?: {
    limit?: number;
    offset?: number;
    filter?: Record<string, unknown>;
  }) => Promise<VectorDocument[]>;
  getStats: () => Promise<{
    totalItems: number;
    bySourceType: Record<string, number>;
  }>;
  close: () => Promise<void>;
  getAdapterInfo: () => ReturnType<VectorDBAdapter["getInfo"]> | null;
}

export function createDatabaseService(
  factory?: ReturnType<typeof createFactory>,
): DatabaseService {
  // Use provided factory or create a default one
  const factoryInstance = factory || createFactory();
  let adapter: VectorDBAdapter | null = null;

  /**
   * Get the adapter instance
   */
  const getAdapter = (): VectorDBAdapter => {
    if (!adapter) {
      throw new Error("Database service not initialized");
    }
    return adapter;
  };

  /**
   * Initialize the database service
   */
  const initialize = async (
    config?: Parameters<typeof factoryInstance.create>[0],
  ): Promise<void> => {
    adapter = await factoryInstance.create(config);
  };

  /**
   * Save an item to the database
   */
  const saveItem = async (params: SaveItemParams): Promise<string> => {
    const { content, embedding, metadata } = params;
    const document = createDocument({ content, embedding, metadata });

    return withErrorHandling(
      () => getAdapter().insert(document),
      "Failed to save item to database",
    );
  };

  /**
   * Save multiple items to the database
   */
  const saveItems = async (items: SaveItemParams[]): Promise<string[]> => {
    const documents = items.map((item) =>
      createDocument({
        content: item.content,
        embedding: item.embedding,
        metadata: item.metadata,
      }),
    );

    return withErrorHandling(
      () => getAdapter().insertBatch(documents),
      "Failed to save items to database",
    );
  };

  /**
   * Search for similar items
   */
  const searchItems = async (
    params: SearchParams,
  ): Promise<VectorSearchResult[]> => {
    const { embedding, k = 5, sourceType } = params;
    const filter = sourceType ? { sourceType } : undefined;

    return withErrorHandling(
      () => getAdapter().search(embedding, { k, filter }),
      "Failed to search items in database",
    );
  };

  /**
   * Count items in the database
   */
  const countItems = async (
    filter?: Record<string, unknown>,
  ): Promise<number> => {
    const currentAdapter = getAdapter();
    return await currentAdapter.count(filter);
  };

  /**
   * List items in the database
   */
  const listItems = async (options?: {
    limit?: number;
    offset?: number;
    filter?: Record<string, unknown>;
  }): Promise<VectorDocument[]> => {
    const currentAdapter = getAdapter();
    return await currentAdapter.list(options);
  };

  /**
   * Get database statistics
   */
  const getStats = async (): Promise<{
    totalItems: number;
    bySourceType: Record<string, number>;
  }> => {
    const currentAdapter = getAdapter();

    const totalItems = await currentAdapter.count();
    const sourceTypes = ["gist", "github", "file", "text"];
    const bySourceType: Record<string, number> = {};

    for (const type of sourceTypes) {
      bySourceType[type] = await currentAdapter.count({ sourceType: type });
    }

    return {
      totalItems,
      bySourceType,
    };
  };

  /**
   * Close the database connection
   */
  const close = async (): Promise<void> => {
    if (adapter) {
      await adapter.close();
      adapter = null;
    }
  };

  /**
   * Get adapter information
   */
  const getAdapterInfo = (): ReturnType<VectorDBAdapter["getInfo"]> | null => {
    return adapter?.getInfo() || null;
  };

  return {
    initialize,
    saveItem,
    saveItems,
    searchItems,
    countItems,
    listItems,
    getStats,
    close,
    getAdapterInfo,
  };
}

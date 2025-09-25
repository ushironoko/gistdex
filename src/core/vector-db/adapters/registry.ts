import { createMemoryAdapter } from "./memory-adapter.js";
import type {
  AdapterFactory,
  VectorDBAdapter,
  VectorDBConfig,
} from "./types.js";

/**
 * Registry interface for vector database adapters
 */
export interface RegistryInterface {
  register: (provider: string, factory: AdapterFactory) => void;
  get: (provider: string) => Promise<AdapterFactory | undefined>;
  create: (config: VectorDBConfig) => Promise<VectorDBAdapter>;
  listProviders: () => Promise<string[]>;
  hasProvider: (provider: string) => Promise<boolean>;
  unregister: (provider: string) => Promise<boolean>;
  clear: () => void;
}
/**
 * Create a registry for vector database adapters using closure pattern
 */
export const createRegistry = (): RegistryInterface => {
  // Private state
  const adapters = new Map<string, AdapterFactory>();
  let initialized = false;

  // Initialize with built-in adapters
  const initialize = async () => {
    if (initialized) return;

    // Register built-in adapters
    register("memory", createMemoryAdapter);

    // Conditionally register SQLite adapters based on runtime
    if (typeof Bun !== "undefined") {
      // Running in Bun - register Bun SQLite adapter
      try {
        const { createBunSQLiteAdapter } = await import(
          "./bun-sqlite-adapter.js"
        );
        register("sqlite", createBunSQLiteAdapter); // Default SQLite in Bun
        register("bun-sqlite", createBunSQLiteAdapter);
        register("sqlite-bun", createBunSQLiteAdapter); // Alias
      } catch {
        // Fallback to Node.js SQLite if Bun adapter fails
        try {
          const { createSQLiteAdapter } = await import("./sqlite-adapter.js");
          register("sqlite", createSQLiteAdapter);
          register("sqlite-node", createSQLiteAdapter);
        } catch {
          // SQLite not available
        }
      }
    } else {
      // Running in Node.js - register Node.js SQLite adapter
      try {
        const { createSQLiteAdapter } = await import("./sqlite-adapter.js");
        register("sqlite", createSQLiteAdapter); // Default SQLite in Node.js
        register("sqlite-node", createSQLiteAdapter); // Alias
      } catch {
        // SQLite not available
      }
    }

    // Register DuckDB adapter
    try {
      const { createDuckDBAdapter } = await import("./duckdb-adapter.js");
      register("duckdb", createDuckDBAdapter);
      console.log("DuckDB adapter registered successfully");
    } catch (error) {
      console.error("Failed to register DuckDB adapter:", error);
      // DuckDB not available
    }

    initialized = true;
  };

  // Register an adapter factory
  const register = (provider: string, factory: AdapterFactory): void => {
    if (adapters.has(provider)) {
      throw new Error(`Adapter already registered for provider: ${provider}`);
    }
    adapters.set(provider, factory);
  };

  // Get a registered adapter factory
  const get = async (provider: string): Promise<AdapterFactory | undefined> => {
    await initialize();
    return adapters.get(provider);
  };

  // Create an adapter instance
  const create = async (config: VectorDBConfig): Promise<VectorDBAdapter> => {
    await initialize();

    const factory = await get(config.provider);
    if (!factory) {
      throw new Error(`No adapter registered for provider: ${config.provider}`);
    }

    // Factory can return either a VectorDBAdapter or Promise<VectorDBAdapter>
    const adapter = factory(config);
    return await Promise.resolve(adapter);
  };

  // List all registered providers
  const listProviders = async (): Promise<string[]> => {
    await initialize();
    return Array.from(adapters.keys());
  };

  // Check if a provider is registered
  const hasProvider = async (provider: string): Promise<boolean> => {
    await initialize();
    return adapters.has(provider);
  };

  // Unregister a provider (mainly for testing)
  const unregister = async (provider: string): Promise<boolean> => {
    await initialize();
    return adapters.delete(provider);
  };

  // Clear all registered adapters (mainly for testing)
  const clear = (): void => {
    adapters.clear();
    initialized = false;
  };

  // Return the registry interface
  return {
    register,
    get,
    create,
    listProviders,
    hasProvider,
    unregister,
    clear,
  };
};

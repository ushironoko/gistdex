import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  getDefaultGistdexConfig,
  mergeGistdexConfig,
} from "../utils/config-merger.js";
import type {
  AdapterFactory,
  VectorDBConfig,
} from "../vector-db/adapters/types.js";

/**
 * Extended configuration type for Gistdex
 *
 * Note: VectorDBConfig.options supports provider-specific configurations:
 * - SQLite/Bun-SQLite: { path, dimension, customSqlitePath?, sqliteVecPath? }
 * - DuckDB: { path, dimension, enableHNSW?, hnswMetric?, hnswPersistence? }
 * - Memory: { dimension }
 */
export interface GistdexConfig {
  vectorDB?: VectorDBConfig;
  customAdapters?: Record<string, string>; // provider -> adapter file path
  embedding?: {
    model?: string;
    dimension?: number;
  };
  indexing?: {
    chunkSize?: number;
    chunkOverlap?: number;
    batchSize?: number;
    preserveBoundaries?: boolean;
  };
  search?: {
    defaultK?: number;
    enableRerank?: boolean;
    rerankBoostFactor?: number;
    hybridKeywordWeight?: number;
  };
  ci?: {
    doc?: {
      threshold?: number;
      documentPaths?: string[];
    };
  };
}

/**
 * Creates configuration operations for managing Gistdex configuration
 */
export const createConfigOperations = (configPath = "gistdex.config.json") => {
  let cachedConfig: GistdexConfig | null = null;

  /**
   * Load configuration from file
   */
  const loadConfigFile = async (path?: string): Promise<GistdexConfig> => {
    const paths = path
      ? [path]
      : [
          "./gistdex.config.ts",
          "./gistdex.config.js",
          "./gistdex.config.json",
          "./.gistdexrc.json",
          join(homedir(), ".gistdex", "config.json"),
        ];

    for (const p of paths) {
      if (existsSync(p)) {
        try {
          // Handle TypeScript/JavaScript config files
          if (p.endsWith(".ts") || p.endsWith(".js")) {
            const resolvedPath = resolve(p);
            const fileUrl = new URL(`file://${resolvedPath}`).href;
            const module = await import(fileUrl);

            // Support both default export and direct config export
            const config = module.default || module;

            // Validate that the config is an object
            if (typeof config === "object" && config !== null) {
              return config as GistdexConfig;
            }
            throw new Error(`Invalid config format in ${p}`);
          }

          // Handle JSON config files
          const content = await readFile(p, "utf-8");
          const parsed = JSON.parse(content) as GistdexConfig;
          return parsed;
        } catch {
          // Continue to next path
        }
      }
    }

    return {};
  };

  /**
   * Apply default configuration values using defu
   */
  const applyDefaults = (config: Partial<GistdexConfig>): GistdexConfig => {
    return mergeGistdexConfig(config, getDefaultGistdexConfig());
  };

  /**
   * Load configuration from file
   * Priority: Config file > Defaults
   */
  const load = async (path?: string): Promise<GistdexConfig> => {
    if (cachedConfig && !path) {
      return cachedConfig;
    }

    // Load config file
    const configFile = await loadConfigFile(path);

    // Apply defaults using defu (handles partial configs properly)
    const config = applyDefaults(configFile);

    cachedConfig = config;
    return config;
  };

  /**
   * Save configuration to file
   */
  const save = async (config: GistdexConfig): Promise<void> => {
    await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
    cachedConfig = config;
  };

  /**
   * Load custom adapter factories from file paths
   */
  const loadCustomAdapters = async (
    config: GistdexConfig,
  ): Promise<Map<string, AdapterFactory>> => {
    const adapters = new Map<string, AdapterFactory>();

    if (!config.customAdapters) {
      return adapters;
    }

    for (const [provider, adapterPath] of Object.entries(
      config.customAdapters,
    )) {
      try {
        const resolvedPath = resolve(adapterPath);
        const module = await import(resolvedPath);

        // Try to find the factory function in multiple patterns
        let factory: unknown;

        // 1. Try the recommended standard name
        if (
          module.createAdapter &&
          typeof module.createAdapter === "function"
        ) {
          factory = module.createAdapter;
        }
        // 2. Try default export
        else if (module.default && typeof module.default === "function") {
          factory = module.default;
        }
        // 3. Try provider-specific naming (e.g., createPineconeAdapter)
        else {
          const providerSpecificName = `create${provider
            .charAt(0)
            .toUpperCase()}${provider.slice(1)}Adapter`;
          if (
            module[providerSpecificName] &&
            typeof module[providerSpecificName] === "function"
          ) {
            factory = module[providerSpecificName];
          }
        }

        // 4. If still not found, look for the first exported function
        if (!factory) {
          const exportedFunctions = Object.entries(module)
            .filter(([_, value]) => typeof value === "function")
            .map(([key, value]) => ({ key, value }));

          if (exportedFunctions.length === 1) {
            factory = exportedFunctions[0]?.value;
          } else if (exportedFunctions.length > 1) {
            // Try to find one that looks like an adapter factory
            const adapterFunction = exportedFunctions.find(
              ({ key }) =>
                key.toLowerCase().includes("adapter") ||
                key.toLowerCase().includes("create"),
            );
            if (adapterFunction) {
              factory = adapterFunction.value;
            }
          }
        }

        if (typeof factory !== "function") {
          throw new Error(
            `Custom adapter at ${adapterPath} must export a factory function. Expected one of: 'createAdapter' (named export), 'default' (default export), 'create${provider
              .charAt(0)
              .toUpperCase()}${provider.slice(
              1,
            )}Adapter' (provider-specific), or a single exported function.`,
          );
        }

        adapters.set(provider, factory as AdapterFactory);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("must export a factory function")
        ) {
          throw error;
        }
        throw new Error(
          `Failed to load custom adapter at ${adapterPath}: ${error}`,
        );
      }
    }

    return adapters;
  };

  /**
   * Get vector DB configuration with CLI overrides
   */
  const getVectorDBConfig = async (
    cliOverrides?: Partial<VectorDBConfig> & { db?: string },
  ): Promise<VectorDBConfig> => {
    const config = await load();
    let dbConfig = config.vectorDB || {
      provider: "sqlite",
      options: {
        path: "./gistdex.db",
        dimension: 768,
      },
    };

    if (cliOverrides) {
      // Create a new config object preserving existing options
      dbConfig = {
        ...dbConfig,
        provider: cliOverrides.provider || dbConfig.provider,
        options: {
          ...dbConfig.options,
          ...(cliOverrides.db && { path: cliOverrides.db }),
        },
      };
    }

    return dbConfig;
  };

  /**
   * Reset cached configuration
   */
  const reset = (): void => {
    cachedConfig = null;
  };

  return {
    load,
    save,
    loadCustomAdapters,
    getVectorDBConfig,
    reset,
  };
};

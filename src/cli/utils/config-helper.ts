import { existsSync } from "node:fs";
import { createConfigOperations } from "../../core/config/config-operations.js";
import type { AdapterFactory } from "../../core/vector-db/adapters/types.js";

export async function getDBConfig(values: {
  provider?: string;
  db?: string;
  [key: string]: string | boolean | undefined;
}): Promise<{
  config: { provider: string; options?: Record<string, unknown> };
  customAdapters: Map<string, AdapterFactory>;
}> {
  const configOps = createConfigOperations();
  const config = await configOps.load();

  // Override provider if specified
  const provider = values.provider || config.vectorDB?.provider || "sqlite";

  // Start with the full options from the config file
  let options = config.vectorDB?.options || {};

  // Override the database path if specified
  if (values.db && typeof values.db === "string") {
    options = { ...options, path: values.db };
  } else if (!options.path) {
    // Set default path if not specified
    options = { ...options, path: "./gistdex.db" };
  }

  // Load custom adapters if configured
  const customAdapters = new Map<string, AdapterFactory>();
  if (config.customAdapters) {
    for (const [name, path] of Object.entries(config.customAdapters)) {
      if (typeof path === "string" && existsSync(path)) {
        try {
          const module = await import(path);
          const factory = module.default || module.createAdapter;
          if (typeof factory === "function") {
            customAdapters.set(name, factory);
          }
        } catch (error) {
          console.warn(`Failed to load custom adapter from ${path}:`, error);
        }
      }
    }
  }

  return {
    config: {
      provider,
      options,
    },
    customAdapters,
  };
}

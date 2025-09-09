import { createRegistry, type RegistryInterface } from "./registry.js";
import type { AdapterFactory } from "./types.js";

/**
 * Execute an operation with a fresh registry instance
 * @param operation - The operation to execute with the registry
 * @returns The result of the operation
 */
export const withRegistry = async <T>(
  operation: (registry: RegistryInterface) => Promise<T>,
): Promise<T> => {
  const registry = createRegistry();
  return await operation(registry);
};

/**
 * Execute an operation with a registry that has custom adapters
 * @param customAdapters - Map of custom adapter factories to register
 * @param operation - The operation to execute with the registry
 * @returns The result of the operation
 */
export const withCustomRegistry = async <T>(
  customAdapters: Map<string, AdapterFactory>,
  operation: (registry: RegistryInterface) => Promise<T>,
): Promise<T> => {
  const registry = createRegistry();

  // Register custom adapters
  for (const [provider, factory] of customAdapters) {
    registry.register(provider, factory);
  }

  return await operation(registry);
};

/**
 * Get a default registry instance with built-in adapters
 * Note: This creates a new instance each time, avoiding global state
 * @returns A new registry instance
 */
export const getDefaultRegistry = (): RegistryInterface => {
  return createRegistry();
};

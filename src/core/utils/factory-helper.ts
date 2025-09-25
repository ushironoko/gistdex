/**
 * Factory Helper Utilities
 *
 * Provides functional composition patterns for creating factories
 * without using classes, following the functional programming paradigm.
 * All functions return new functions or objects, avoiding global state.
 */

/**
 * Creates a factory function with default configuration values.
 * Merges default config with provided config before passing to creator.
 *
 * @param defaultConfig - Default configuration values
 * @param creator - Async function that creates the instance
 * @returns Factory function that accepts partial config
 */
export const createFactoryWithDefaults = <TConfig, TInstance>(
  defaultConfig: Partial<TConfig>,
  creator: (config: TConfig) => Promise<TInstance>,
) => {
  return async (config: Partial<TConfig>): Promise<TInstance> => {
    // Merge defaults with provided config
    const mergedConfig = { ...defaultConfig, ...config } as TConfig;

    try {
      return await creator(mergedConfig);
    } catch (error) {
      throw new Error(
        `Failed to create instance: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }
  };
};

/**
 * Creates a factory function with configuration validation.
 * Validates config before passing to creator function.
 *
 * @param validator - Function that validates the configuration (throws on error)
 * @param creator - Async function that creates the instance
 * @returns Factory function that validates then creates
 */
export const createFactoryWithValidation = <TConfig, TInstance>(
  validator: (config: TConfig) => void,
  creator: (config: TConfig) => Promise<TInstance>,
) => {
  return async (config: TConfig): Promise<TInstance> => {
    // Validate configuration first
    try {
      validator(config);
    } catch (error) {
      throw new Error(
        `Configuration validation failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }

    // Create instance after validation
    try {
      return await creator(config);
    } catch (error) {
      throw new Error(
        `Failed to create instance: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }
  };
};

/**
 * Creates a cached factory that loads a resource once and reuses it.
 * Uses closure to maintain cache state without global variables.
 *
 * @param loader - Async function that loads the resource
 * @returns Object with get() and clear() methods
 */
export const createCachedFactory = <T>(loader: () => Promise<T>) => {
  // Private state using closure
  let cache: T | null = null;
  let loadingPromise: Promise<T> | null = null;

  return {
    /**
     * Gets the cached value or loads it if not cached
     */
    get: async (): Promise<T> => {
      // If already cached, return immediately
      if (cache !== null) {
        return cache;
      }

      // If currently loading, wait for the same promise
      if (loadingPromise !== null) {
        return loadingPromise;
      }

      // Start loading and cache the promise to handle concurrent calls
      loadingPromise = loader()
        .then((result) => {
          cache = result;
          loadingPromise = null;
          return result;
        })
        .catch((error) => {
          // Don't cache errors
          loadingPromise = null;
          throw error;
        });

      return loadingPromise;
    },

    /**
     * Clears the cached value
     */
    clear: (): void => {
      cache = null;
      loadingPromise = null;
    },
  };
};

/**
 * Creates a standardized error handler for factory functions.
 * Formats error messages consistently across all adapters.
 *
 * @param componentName - Name of the component/adapter being created
 * @returns Function that formats errors consistently
 */
export const createErrorHandler = (componentName: string) => {
  return (error: unknown): Error => {
    const message = `Failed to create ${componentName}: ${
      error instanceof Error
        ? error.message
        : error === null
          ? "null"
          : error === undefined
            ? "undefined"
            : String(error)
    }`;

    return new Error(message, { cause: error });
  };
};

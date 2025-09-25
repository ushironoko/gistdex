import { describe, expect, it, vi } from "vitest";
import {
  createCachedFactory,
  createErrorHandler,
  createFactoryWithDefaults,
  createFactoryWithValidation,
} from "./factory-helper.js";

describe("factory-helper", () => {
  describe("createFactoryWithDefaults", () => {
    it("should merge default config with provided config", async () => {
      const defaultConfig = { option1: "default", option2: 42 };
      const creator = vi.fn().mockResolvedValue({ result: "success" });

      const factory = createFactoryWithDefaults(defaultConfig, creator);

      const result = await factory({ option1: "custom" });

      expect(creator).toHaveBeenCalledWith({
        option1: "custom",
        option2: 42,
      });
      expect(result).toEqual({ result: "success" });
    });

    it("should handle async creation errors with proper error chain", async () => {
      const defaultConfig = { option: "default" };
      const originalError = new Error("Creation failed");
      const creator = vi.fn().mockRejectedValue(originalError);

      const factory = createFactoryWithDefaults(defaultConfig, creator);

      await expect(factory({})).rejects.toThrow("Failed to create instance");
      await expect(factory({})).rejects.toHaveProperty("cause", originalError);
    });

    it("should work with empty default config", async () => {
      const creator = vi.fn().mockResolvedValue({ result: "ok" });
      const factory = createFactoryWithDefaults({}, creator);

      const result = await factory({ custom: "value" });

      expect(creator).toHaveBeenCalledWith({ custom: "value" });
      expect(result).toEqual({ result: "ok" });
    });
  });

  describe("createFactoryWithValidation", () => {
    it("should validate config before creating instance", async () => {
      const validator = vi.fn();
      const creator = vi.fn().mockResolvedValue({ id: "123" });

      const factory = createFactoryWithValidation(validator, creator);

      const config = { required: "value" };
      const result = await factory(config);

      expect(validator).toHaveBeenCalledWith(config);
      expect(validator).toHaveBeenCalledBefore(creator);
      expect(creator).toHaveBeenCalledWith(config);
      expect(result).toEqual({ id: "123" });
    });

    it("should throw validation error before creation", async () => {
      const validationError = new Error("Invalid config");
      const validator = vi.fn().mockImplementation(() => {
        throw validationError;
      });
      const creator = vi.fn();

      const factory = createFactoryWithValidation(validator, creator);

      await expect(factory({})).rejects.toThrow(
        "Configuration validation failed",
      );
      expect(creator).not.toHaveBeenCalled();
    });

    it("should handle creation errors separately from validation", async () => {
      const validator = vi.fn(); // No error
      const creationError = new Error("Database connection failed");
      const creator = vi.fn().mockRejectedValue(creationError);

      const factory = createFactoryWithValidation(validator, creator);

      await expect(factory({})).rejects.toThrow("Failed to create instance");
      await expect(factory({})).rejects.toHaveProperty("cause", creationError);
      expect(validator).toHaveBeenCalled();
    });
  });

  describe("createCachedFactory", () => {
    it("should cache the result after first call", async () => {
      const loader = vi.fn().mockResolvedValue({ data: "loaded" });
      const factory = createCachedFactory(loader);

      const result1 = await factory.get();
      const result2 = await factory.get();
      const result3 = await factory.get();

      expect(loader).toHaveBeenCalledTimes(1);
      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
      expect(result1).toEqual({ data: "loaded" });
    });

    it("should clear cache when requested", async () => {
      const loader = vi.fn().mockResolvedValue({ count: 1 });
      const factory = createCachedFactory(loader);

      const result1 = await factory.get();
      factory.clear();

      loader.mockResolvedValue({ count: 2 });
      const result2 = await factory.get();

      expect(loader).toHaveBeenCalledTimes(2);
      expect(result1).toEqual({ count: 1 });
      expect(result2).toEqual({ count: 2 });
    });

    it("should handle loader errors", async () => {
      const error = new Error("Load failed");
      const loader = vi.fn().mockRejectedValue(error);
      const factory = createCachedFactory(loader);

      await expect(factory.get()).rejects.toThrow("Load failed");

      // Should not cache errors
      await expect(factory.get()).rejects.toThrow("Load failed");
      expect(loader).toHaveBeenCalledTimes(2);
    });

    it("should handle concurrent calls correctly", async () => {
      let resolveLoader: ((value: unknown) => void) | undefined;
      const loaderPromise = new Promise((resolve) => {
        resolveLoader = resolve;
      });
      const loader = vi.fn().mockReturnValue(loaderPromise);
      const factory = createCachedFactory(loader);

      const promise1 = factory.get();
      const promise2 = factory.get();
      const promise3 = factory.get();

      // All calls should wait for the same promise
      expect(loader).toHaveBeenCalledTimes(1);

      resolveLoader?.({ concurrent: true });

      const [result1, result2, result3] = await Promise.all([
        promise1,
        promise2,
        promise3,
      ]);

      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
      expect(result1).toEqual({ concurrent: true });
    });
  });

  describe("createErrorHandler", () => {
    it("should format error messages consistently", () => {
      const handler = createErrorHandler("TestAdapter");

      const error1 = new Error("Connection failed");
      const formatted1 = handler(error1);
      expect(formatted1.message).toBe(
        "Failed to create TestAdapter: Connection failed",
      );
      expect(formatted1.cause).toBe(error1);

      const error2 = "String error";
      const formatted2 = handler(error2);
      expect(formatted2.message).toBe(
        "Failed to create TestAdapter: String error",
      );
      expect(formatted2.cause).toBe(error2);

      const error3 = { code: "ENOENT" };
      const formatted3 = handler(error3);
      expect(formatted3.message).toContain("Failed to create TestAdapter");
      expect(formatted3.cause).toBe(error3);
    });

    it("should preserve error stack traces", () => {
      const handler = createErrorHandler("Component");
      const originalError = new Error("Original");
      originalError.stack = "Error: Original\n    at test.js:10";

      const formatted = handler(originalError);

      expect(formatted).toBeInstanceOf(Error);
      expect(formatted.cause).toBe(originalError);
      expect((formatted.cause as Error).stack).toBe(
        "Error: Original\n    at test.js:10",
      );
    });

    it("should handle null and undefined gracefully", () => {
      const handler = createErrorHandler("Service");

      const nullError = handler(null);
      expect(nullError.message).toBe("Failed to create Service: null");

      const undefinedError = handler(undefined);
      expect(undefinedError.message).toBe(
        "Failed to create Service: undefined",
      );
    });
  });

  describe("integration", () => {
    it("should combine defaults and validation", async () => {
      const defaultConfig = { timeout: 5000, retries: 3 };
      const validator = (config: Record<string, unknown>) => {
        if (!config.url) throw new Error("URL is required");
      };
      const creator = vi.fn().mockResolvedValue({ connected: true });

      // Combine patterns
      const factoryWithDefaults = createFactoryWithDefaults(
        defaultConfig,
        creator,
      );
      const factoryWithValidation = createFactoryWithValidation(
        validator,
        factoryWithDefaults as typeof creator,
      );

      const result = await factoryWithValidation({
        url: "http://localhost",
        timeout: 10000,
      });

      expect(creator).toHaveBeenCalledWith({
        url: "http://localhost",
        timeout: 10000,
        retries: 3,
      });
      expect(result).toEqual({ connected: true });
    });

    it("should cache validated factories", async () => {
      const validator = vi.fn();
      const creator = vi.fn().mockResolvedValue({ id: "cached" });
      const validatedFactory = createFactoryWithValidation(validator, creator);
      const cachedFactory = createCachedFactory(() =>
        validatedFactory({ valid: true }),
      );

      const result1 = await cachedFactory.get();
      const result2 = await cachedFactory.get();

      expect(validator).toHaveBeenCalledTimes(1);
      expect(creator).toHaveBeenCalledTimes(1);
      expect(result1).toBe(result2);
    });
  });
});

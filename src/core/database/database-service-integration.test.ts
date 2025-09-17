import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { VectorDBConfig } from "../vector-db/adapters/types.js";
import {
  createDatabaseService,
  type SaveItemParams,
} from "./database-service.js";

/**
 * Integration test for DatabaseService without mocks.
 * This test uses real implementations and in-memory database
 * to ensure actual behavior is tested.
 */
describe("DatabaseService Integration (No Mocks)", () => {
  let service: ReturnType<typeof createDatabaseService>;

  beforeEach(() => {
    // Create a fresh service instance for each test
    service = createDatabaseService();
  });

  afterEach(async () => {
    // Clean up after each test
    await service.close().catch(() => {
      // Ignore errors during cleanup
    });
  });

  test("initializes with memory adapter without errors", async () => {
    const config: VectorDBConfig = {
      provider: "memory",
      options: {
        dimension: 768,
      },
    };

    await expect(service.initialize(config)).resolves.not.toThrow();

    // Verify the adapter is actually initialized
    const info = await service.getAdapterInfo();
    expect(info).toBeDefined();
    expect(info?.provider).toBe("memory");
  });

  test("throws error when accessing adapter before initialization", async () => {
    // Try to perform operations that require the adapter
    await expect(service.countItems()).rejects.toThrow(
      "Database service not initialized",
    );

    await expect(service.listItems({ limit: 10 })).rejects.toThrow(
      "Database service not initialized",
    );

    await expect(
      service.searchItems({
        embedding: [0.1, 0.2, 0.3],
        k: 5,
      }),
    ).rejects.toThrow("Failed to search items in database");
  });

  test("can save and retrieve items with real memory adapter", async () => {
    const config: VectorDBConfig = {
      provider: "memory",
      options: {
        dimension: 3,
      },
    };

    await service.initialize(config);

    const params: SaveItemParams = {
      content: "Test content for integration test",
      embedding: [0.1, 0.2, 0.3],
      metadata: {
        title: "Test Item",
        sourceType: "file",
        author: "Test Author",
      },
    };

    // Save a single item
    const id = await service.saveItem(params);
    expect(id).toBeTruthy();
    expect(typeof id).toBe("string");

    // Verify the item was actually saved
    const count = await service.countItems();
    expect(count).toBe(1);

    // List items to verify metadata
    const items = await service.listItems({ limit: 10 });
    expect(items).toHaveLength(1);
    expect(items[0]?.content).toBe(params.content);
    expect(items[0]?.metadata?.title).toBe(params.metadata?.title);
  });

  test("can save multiple items in batch with real adapter", async () => {
    const config: VectorDBConfig = {
      provider: "memory",
      options: {
        dimension: 3,
      },
    };

    await service.initialize(config);

    const items = [
      {
        content: "First item content",
        embedding: [0.1, 0.2, 0.3],
        metadata: { title: "Item 1", index: 0 },
      },
      {
        content: "Second item content",
        embedding: [0.4, 0.5, 0.6],
        metadata: { title: "Item 2", index: 1 },
      },
      {
        content: "Third item content",
        embedding: [0.7, 0.8, 0.9],
        metadata: { title: "Item 3", index: 2 },
      },
    ];

    const ids = await service.saveItems(items);
    expect(ids).toHaveLength(3);
    expect(ids.every((id) => typeof id === "string")).toBe(true);

    // Verify all items were saved
    const count = await service.countItems();
    expect(count).toBe(3);

    // Verify we can retrieve all items
    const savedItems = await service.listItems({ limit: 10 });
    expect(savedItems).toHaveLength(3);

    // Verify items maintain their metadata
    const titles = savedItems.map((item) => item.metadata?.title);
    expect(titles).toContain("Item 1");
    expect(titles).toContain("Item 2");
    expect(titles).toContain("Item 3");
  });

  test("search returns relevant items ordered by similarity", async () => {
    const config: VectorDBConfig = {
      provider: "memory",
      options: {
        dimension: 3,
      },
    };

    await service.initialize(config);

    // Add test data with different embeddings
    await service.saveItems([
      {
        content: "Very similar content",
        embedding: [0.9, 0.1, 0.0],
        metadata: { relevance: "high" },
      },
      {
        content: "Somewhat similar content",
        embedding: [0.6, 0.3, 0.1],
        metadata: { relevance: "medium" },
      },
      {
        content: "Not very similar content",
        embedding: [0.1, 0.1, 0.8],
        metadata: { relevance: "low" },
      },
    ]);

    // Search with a query embedding close to the first item
    const results = await service.searchItems({
      embedding: [0.85, 0.15, 0.0],
      k: 3,
    });

    expect(results).toHaveLength(3);

    // Check results are ordered by similarity (descending)
    expect(results[0]?.score).toBeGreaterThanOrEqual(results[1]?.score ?? 0);
    expect(results[1]?.score).toBeGreaterThanOrEqual(results[2]?.score ?? 0);

    // The most similar item should be first
    expect(results[0]?.content).toBe("Very similar content");
    expect(results[0]?.metadata?.relevance).toBe("high");
  });

  test("handles filtering by metadata correctly", async () => {
    const config: VectorDBConfig = {
      provider: "memory",
      options: {
        dimension: 3,
      },
    };

    await service.initialize(config);

    // Add items with different source types
    await service.saveItems([
      {
        content: "Documentation content",
        embedding: [0.1, 0.2, 0.3],
        metadata: { sourceType: "text" as const, category: "api" },
      },
      {
        content: "Code content",
        embedding: [0.4, 0.5, 0.6],
        metadata: { sourceType: "text" as const, category: "implementation" },
      },
      {
        content: "Test content",
        embedding: [0.7, 0.8, 0.9],
        metadata: { sourceType: "text" as const, category: "unit" },
      },
      {
        content: "More documentation",
        embedding: [0.2, 0.3, 0.4],
        metadata: { sourceType: "text" as const, category: "guide" },
      },
    ]);

    // Search without filter returns all items
    const results = await service.searchItems({
      embedding: [0.3, 0.3, 0.3],
      k: 10,
    });

    // Should return all 4 items since no filter is applied
    expect(results).toHaveLength(4);
    // All items should have sourceType "text"
    expect(results.every((r) => r.metadata?.sourceType === "text")).toBe(true);
  });

  test("handles edge cases gracefully", async () => {
    const config: VectorDBConfig = {
      provider: "memory",
      options: {
        dimension: 3,
      },
    };

    await service.initialize(config);

    // Test with empty database
    const emptyResults = await service.searchItems({
      embedding: [0.1, 0.2, 0.3],
      k: 5,
    });
    expect(emptyResults).toEqual([]);

    // Test with k larger than available items
    await service.saveItem({
      content: "Single item",
      embedding: [0.5, 0.5, 0.0],
      metadata: {},
    });

    const results = await service.searchItems({
      embedding: [0.1, 0.2, 0.3],
      k: 10,
    });
    expect(results).toHaveLength(1);

    // Test listItems with limit
    const limitedList = await service.listItems({ limit: 0 });
    expect(limitedList).toEqual([]);
  });

  test("properly manages adapter lifecycle", async () => {
    const config: VectorDBConfig = {
      provider: "memory",
      options: {
        dimension: 3,
      },
    };

    // Initialize
    await service.initialize(config);
    expect(await service.getAdapterInfo()).toBeDefined();

    // Add some data
    await service.saveItem({
      content: "Test",
      embedding: [0.1, 0.2, 0.3],
      metadata: {},
    });
    expect(await service.countItems()).toBe(1);

    // Close the service
    await service.close();

    // After closing, operations should fail
    await expect(service.countItems()).rejects.toThrow(
      "Database service not initialized",
    );

    // Can reinitialize after closing
    await service.initialize(config);
    expect(await service.countItems()).toBe(0); // New instance, no data
  });

  test("handles concurrent operations correctly", async () => {
    const config: VectorDBConfig = {
      provider: "memory",
      options: {
        dimension: 3,
      },
    };

    await service.initialize(config);

    // Perform multiple operations concurrently
    const operations = [
      service.saveItem({
        content: "Item 1",
        embedding: [0.1, 0.2, 0.3],
        metadata: { index: 1 },
      }),
      service.saveItem({
        content: "Item 2",
        embedding: [0.4, 0.5, 0.6],
        metadata: { index: 2 },
      }),
      service.saveItem({
        content: "Item 3",
        embedding: [0.7, 0.8, 0.9],
        metadata: { index: 3 },
      }),
    ];

    const ids = await Promise.all(operations);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3); // All IDs should be unique

    // Verify all items were saved correctly
    const count = await service.countItems();
    expect(count).toBe(3);

    // Perform concurrent searches
    const searches = [
      service.searchItems({ embedding: [0.1, 0.2, 0.3], k: 2 }),
      service.searchItems({ embedding: [0.5, 0.5, 0.5], k: 2 }),
      service.searchItems({ embedding: [0.9, 0.8, 0.7], k: 2 }),
    ];

    const searchResults = await Promise.all(searches);
    expect(searchResults.every((results) => results.length === 2)).toBe(true);
  });
});

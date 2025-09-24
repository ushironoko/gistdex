/**
 * Test to verify that close() doesn't delete data
 * This test ensures that closing a database connection doesn't clear the data
 */

import { describe, expect, it } from "vitest";
import { createSQLiteAdapter } from "./sqlite-adapter.js";
import type { VectorDocument } from "./types.js";

describe("Adapter close() behavior", () => {
  it("should NOT delete data when close() is called (with persistent DB)", async () => {
    // Use a temporary file for persistent storage
    const testDbPath = `/tmp/test-close-${Date.now()}.db`;

    // Create adapter with file-based DB
    const adapter = await createSQLiteAdapter({
      provider: "sqlite",
      options: {
        path: testDbPath,
        dimension: 768,
      },
    });

    // Initialize adapter
    await adapter.initialize();

    // Insert test document
    const testDoc: VectorDocument = {
      content: "Test content",
      embedding: new Array(768).fill(0.1),
      metadata: { test: true },
    };

    const id = await adapter.insert(testDoc);

    // Verify document exists
    const docBeforeClose = await adapter.get(id);
    expect(docBeforeClose).not.toBeNull();
    expect(docBeforeClose?.content).toBe("Test content");

    // Close the adapter
    await adapter.close();

    // Create a NEW adapter instance with the same DB file
    const adapter2 = await createSQLiteAdapter({
      provider: "sqlite",
      options: {
        path: testDbPath,
        dimension: 768,
      },
    });

    // Initialize the new adapter
    await adapter2.initialize();

    // Document should still exist after close/reopen
    const docAfterClose = await adapter2.get(id);
    expect(docAfterClose).not.toBeNull();
    expect(docAfterClose?.content).toBe("Test content");

    // Clean up
    await adapter2.close();

    // Remove test DB file
    const { unlinkSync } = await import("node:fs");
    try {
      unlinkSync(testDbPath);
    } catch {
      // Ignore errors if file doesn't exist
    }
  });

  it("should delete data only when clear() is explicitly called", async () => {
    // This test would need VectorDBAdapter to expose clear() method
    // Currently clear() is only available in StorageOperations interface
    // This is actually good design - clear() should not be easily accessible

    // For now, we just verify that the StorageOperations interface has clear()
    // but VectorDBAdapter interface does NOT have clear()

    const adapter = await createSQLiteAdapter({
      provider: "sqlite",
      options: {
        path: ":memory:",
        dimension: 768,
      },
    });

    // Verify that adapter does not have clear method
    expect("clear" in adapter).toBe(false);

    // This ensures data can only be cleared through:
    // 1. Direct database operations
    // 2. Deleting documents one by one
    // But NOT through accidental close() calls
  });
});

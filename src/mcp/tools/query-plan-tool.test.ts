import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../../core/database/database-service.js";
import type { VectorSearchResult } from "../../core/vector-db/adapters/types.js";
import { handleQueryPlanTool } from "./query-plan-tool.js";

// Mock the search module
vi.mock("../../core/search/search.js", () => ({
  semanticSearch: vi
    .fn()
    .mockImplementation(async (_query, options, service) => {
      if (service?.searchItems) {
        return service.searchItems({
          embedding: new Float32Array(768),
          k: options?.k || 5,
          sourceType: options?.sourceType,
        });
      }
      return [];
    }),
  hybridSearch: vi.fn().mockImplementation(async (_query, options, service) => {
    if (service?.searchItems) {
      return service.searchItems({
        embedding: new Float32Array(768),
        k: options?.k || 5,
        sourceType: options?.sourceType,
      });
    }
    return [];
  }),
}));

// Helper function to create mock database service
function createMockService(
  searchResults: VectorSearchResult[],
): DatabaseService {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    saveItem: vi.fn().mockResolvedValue(""),
    saveItems: vi.fn().mockResolvedValue([]),
    searchItems: vi.fn().mockResolvedValue(searchResults),
    countItems: vi.fn().mockResolvedValue(searchResults.length),
    listItems: vi.fn().mockResolvedValue(searchResults),
    getStats: vi.fn().mockResolvedValue({
      totalItems: searchResults.length,
      bySourceType: {},
    }),
    close: vi.fn().mockResolvedValue(undefined),
    getAdapterInfo: vi.fn().mockReturnValue({
      name: "mock",
      version: "1.0.0",
      description: "Mock adapter for testing",
    }),
  };
}

describe("query-plan-tool", () => {
  let testCacheDir: string;
  let mockDatabaseService: DatabaseService;

  beforeEach(() => {
    // Create a temporary cache directory for testing
    testCacheDir = join(tmpdir(), `gistdex-test-${Date.now()}`);
    mkdirSync(testCacheDir, { recursive: true });
    process.env.GISTDEX_CACHE_DIR = testCacheDir;

    // Create mock database service
    mockDatabaseService = {
      initialize: vi.fn(),
      saveItem: vi.fn(),
      saveItems: vi.fn(),
      searchItems: vi.fn(),
      countItems: vi.fn(),
      listItems: vi.fn(),
      getStats: vi.fn(),
      close: vi.fn(),
      getAdapterInfo: vi.fn().mockReturnValue({
        name: "mock",
        version: "1.0.0",
        description: "Mock adapter for testing",
      }),
    } as const satisfies DatabaseService;
  });

  afterEach(() => {
    // Clean up test cache directory
    if (testCacheDir) {
      rmSync(testCacheDir, { recursive: true, force: true });
    }
    delete process.env.GISTDEX_CACHE_DIR;
    vi.clearAllMocks();
  });

  describe("executeQuery integration", () => {
    it("should use database service for semantic search", async () => {
      const mockResults: VectorSearchResult[] = [
        {
          id: "1",
          content: "VitePress configuration guide",
          score: 0.95,
          metadata: {
            sourceType: "file",
            path: "docs/config.md",
          },
        },
        {
          id: "2",
          content: "export default defineConfig",
          score: 0.85,
          metadata: {
            sourceType: "gist",
            url: "https://gist.github.com/example",
          },
        },
      ];

      // Mock the searchItems to return results
      vi.mocked(mockDatabaseService.searchItems).mockResolvedValue(mockResults);

      const result = await handleQueryPlanTool(
        {
          goal: "Find VitePress configuration",
          maxIterations: 1,
          expectedResults: {
            keywords: ["vitepress", "config"],
            minMatches: 2,
            confidence: 0.8,
          },
        },
        { service: mockDatabaseService },
      );

      expect(result.success).toBe(true);
      expect(mockDatabaseService.searchItems).toHaveBeenCalled();
    });

    it("should use hybrid search when evaluationMode is not strict", async () => {
      const mockResults: VectorSearchResult[] = [
        {
          id: "1",
          content: "Test content with keywords",
          score: 0.75,
          metadata: {},
        },
      ];

      vi.mocked(mockDatabaseService.searchItems).mockResolvedValue(mockResults);

      const result = await handleQueryPlanTool(
        {
          goal: "Test hybrid search",
          evaluationMode: "fuzzy",
          maxIterations: 1,
        },
        { service: mockDatabaseService },
      );

      expect(result.success).toBe(true);
      expect(mockDatabaseService.searchItems).toHaveBeenCalled();
    });

    it("should iterate until confidence threshold is met", async () => {
      const mockResults1: VectorSearchResult[] = [
        {
          id: "1",
          content: "Partial match",
          score: 0.5,
          metadata: {},
        },
      ];

      const mockResults2: VectorSearchResult[] = [
        {
          id: "2",
          content: "Better match with all keywords",
          score: 0.9,
          metadata: {},
        },
      ];

      // Return different results on successive calls
      vi.mocked(mockDatabaseService.searchItems)
        .mockResolvedValueOnce(mockResults1)
        .mockResolvedValueOnce(mockResults2);

      const result = await handleQueryPlanTool(
        {
          goal: "Test iteration",
          maxIterations: 3,
          expectedResults: {
            keywords: ["better", "match", "keywords"],
            confidence: 0.85,
          },
        },
        { service: mockDatabaseService },
      );

      expect(result.success).toBe(true);
      // Planner may call more times during refinement process
      expect(mockDatabaseService.searchItems).toHaveBeenCalledTimes(3);
      expect(result.result?.iterations.length).toBeGreaterThanOrEqual(2);
    });

    it("should save results to cache when successful", async () => {
      const mockResults: VectorSearchResult[] = [
        {
          id: "1",
          content: "Cached content",
          score: 0.95,
          metadata: {
            sourceType: "file",
            path: "test.md",
          },
        },
      ];

      vi.mocked(mockDatabaseService.searchItems).mockResolvedValue(mockResults);

      const result = await handleQueryPlanTool(
        {
          goal: "Test caching",
          maxIterations: 1,
          saveIntermediateResults: true,
        },
        { service: mockDatabaseService },
      );

      expect(result.success).toBe(true);
      expect(result.result?.savedAt).toBeDefined();
      expect(result.result?.structuredKnowledgePath).toBeDefined();

      // Verify files were created
      if (result.result?.savedAt) {
        const planContent = readFileSync(result.result.savedAt, "utf-8");
        const plan = JSON.parse(planContent);
        expect(plan.planId).toBeDefined();
        expect(plan.goal).toBe("Test caching");
      }

      if (result.result?.structuredKnowledgePath) {
        const knowledgeContent = readFileSync(
          result.result.structuredKnowledgePath,
          "utf-8",
        );
        expect(knowledgeContent).toContain("# Test caching");
        expect(knowledgeContent).toContain("Cached content");
      }
    });

    it("should handle search failures gracefully", async () => {
      vi.mocked(mockDatabaseService.searchItems).mockRejectedValue(
        new Error("Search failed"),
      );

      const result = await handleQueryPlanTool(
        {
          goal: "Test error handling",
          maxIterations: 1,
        },
        { service: mockDatabaseService },
      );

      expect(result.success).toBe(true); // Still returns success structure
      expect(result.result?.status).toBe("failed");
      expect(mockDatabaseService.searchItems).toHaveBeenCalled();
    });

    it("should respect maxIterations limit", async () => {
      // Always return low-confidence results
      vi.mocked(mockDatabaseService.searchItems).mockResolvedValue([
        {
          id: "1",
          content: "Low confidence match",
          score: 0.3,
          metadata: {},
        },
      ]);

      const result = await handleQueryPlanTool(
        {
          goal: "Test max iterations",
          maxIterations: 2,
          expectedResults: {
            confidence: 0.9, // High threshold that won't be met
          },
        },
        { service: mockDatabaseService },
      );

      expect(result.success).toBe(true);
      expect(mockDatabaseService.searchItems).toHaveBeenCalledTimes(2);
      expect(result.result?.iterations).toHaveLength(2);
      expect(result.result?.status).not.toBe("success");
    });
  });

  describe("backwards compatibility", () => {
    it("should work without service parameter (with mock implementation)", async () => {
      // Create an empty mock service that returns no results
      const emptyService: DatabaseService = {
        initialize: vi.fn().mockResolvedValue(undefined),
        saveItem: vi.fn().mockResolvedValue(""),
        saveItems: vi.fn().mockResolvedValue([]),
        searchItems: vi.fn().mockResolvedValue([]),
        countItems: vi.fn().mockResolvedValue(0),
        listItems: vi.fn().mockResolvedValue([]),
        getStats: vi.fn().mockResolvedValue({
          totalItems: 0,
          bySourceType: {},
        }),
        close: vi.fn().mockResolvedValue(undefined),
        getAdapterInfo: vi.fn().mockReturnValue({
          name: "empty",
          version: "1.0.0",
          description: "Empty mock adapter",
        }),
      };

      const result = await handleQueryPlanTool(
        {
          goal: "Test without real service",
          maxIterations: 1,
        },
        { service: emptyService },
      );

      // With empty service, it should still work but return failed status
      expect(result.success).toBe(true);
      expect(result.result?.status).toBe("failed");
      expect(result.result?.finalResults.data).toHaveLength(0);

      // Verify the service was called
      expect(emptyService.searchItems).toHaveBeenCalled();
    });
  });

  describe("timeout handling", () => {
    it("should use custom timeout when specified", async () => {
      const service = createMockService([
        {
          id: "1",
          content: "slow result",
          score: 0.9,
          metadata: { sourceType: "file" },
        },
      ]);

      // Mock slow execution
      vi.spyOn(service, "searchItems").mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms delay
        return [
          {
            id: "1",
            content: "slow result",
            score: 0.9,
            metadata: { sourceType: "file" },
          },
        ];
      });

      const result = await handleQueryPlanTool(
        {
          goal: "test timeout",
          timeoutSeconds: 15, // 15 second timeout (above minimum)
          maxIterations: 2,
        },
        { service },
      );

      expect(result.success).toBe(true);
      // Should complete within timeout
      expect(result.result.status).not.toBe("failed");
    });

    it("should return partial results on timeout", async () => {
      const service = createMockService([]);

      let callCount = 0;
      // Mock execution that gets progressively slower
      vi.spyOn(service, "searchItems").mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // First call succeeds quickly
          return [
            {
              id: "2",
              content: "first result",
              score: 0.7,
              metadata: { sourceType: "file" },
            },
          ];
        }
        // Subsequent calls would timeout (but use shorter delay for test)
        await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second delay
        return [];
      });

      const result = await handleQueryPlanTool(
        {
          goal: "test timeout partial",
          timeoutSeconds: 10, // 10 second timeout (minimum allowed)
          maxIterations: 3,
        },
        { service },
      );

      // Should return success with partial results
      expect(result.success).toBe(true);
      // The timeout logic should allow at least one iteration to complete
      expect(callCount).toBeGreaterThanOrEqual(1);
    }, 15000); // Set test timeout to 15 seconds
  });
});

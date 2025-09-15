import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../../core/database/database-service.js";
import type { VectorSearchResult } from "../../core/vector-db/adapters/types.js";
import { agentQueryToolSchema } from "../schemas/validation.js";
import {
  type AgentQueryOptions,
  handleAgentQuery,
} from "./agent-query-tool.js";

// Mock the core modules
vi.mock("../../core/search/search.js", () => ({
  semanticSearch: vi.fn(),
  hybridSearch: vi.fn(),
  rerankResults: vi.fn((_query, results) => results),
}));

vi.mock("../utils/metadata-generator.js", () => ({
  analyzeSemanticCoherence: vi.fn(() => ({
    coherence: 0.8,
    diversity: 0.7,
    topicClusters: [{ topic: "test", confidence: 0.9, resultIndices: [0, 1] }],
  })),
  analyzeContentTypes: vi.fn(() => ({
    contentTypes: [
      { type: "code", count: 3, percentage: 0.6 },
      { type: "documentation", count: 1, percentage: 0.2 },
      { type: "example", count: 1, percentage: 0.2 },
    ],
    codeLanguages: ["TypeScript"],
    hasExamples: true,
    hasImplementation: true,
  })),
}));

describe("agent-query-tool", () => {
  let mockService: DatabaseService;
  let options: AgentQueryOptions;
  let mockSearchResults: VectorSearchResult[];

  beforeEach(() => {
    vi.clearAllMocks();

    mockSearchResults = [
      {
        id: "1",
        content: "Test content about TypeScript functions and types",
        score: 0.95,
        metadata: { sourceType: "file", title: "test.ts" },
      },
      {
        id: "2",
        content: "Another test about TypeScript classes and interfaces",
        score: 0.85,
        metadata: { sourceType: "file", title: "test2.ts" },
      },
      {
        id: "3",
        content: "Documentation about TypeScript generics and types",
        score: 0.75,
        metadata: { sourceType: "file", title: "docs.md" },
      },
    ];

    mockService = {
      initialize: vi.fn(),
      close: vi.fn(),
      saveItem: vi.fn(),
      saveItems: vi.fn(),
      searchItems: vi.fn().mockResolvedValue(mockSearchResults),
      countItems: vi.fn(),
      getStats: vi.fn(),
      listItems: vi.fn(),
      getAdapterInfo: vi.fn(),
    };

    options = {
      service: mockService,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Summary Mode", () => {
    it("should return summary response when mode is 'summary'", async () => {
      const { semanticSearch } = await import("../../core/search/search.js");
      vi.mocked(semanticSearch).mockResolvedValue(mockSearchResults);

      const input = {
        query: "TypeScript functions",
        goal: "Find TypeScript function implementations",
        options: {
          mode: "summary" as const,
          k: 5,
        },
      };

      const result = await handleAgentQuery(input, options);

      // Verify summary mode response structure
      expect(result.success).toBe(true);
      expect(result.summary).toBeDefined();
      expect(result.summary?.totalResults).toBe(3);
      expect(result.summary?.avgScore).toBeCloseTo(0.85, 2);
      expect(result.summary?.qualityLevel).toBe("high");
      expect(result.summary?.mainTopics).toHaveLength(3);
      expect(result.summary?.coverageStatus).toBeDefined();

      // Verify primary action is present
      expect(result.primaryAction).toBeDefined();
      expect(result.primaryAction?.action).toBeDefined();
      expect(result.primaryAction?.reasoning).toBeDefined();
      expect(result.primaryAction?.confidence).toBeGreaterThan(0);

      // Verify recommendation
      expect(result.recommendation).toBeDefined();
      expect(result.recommendation?.needsMoreDetail).toBeDefined();

      // Verify token count is limited
      expect(result.estimatedTokens).toBeLessThan(5000);

      // Verify that detailed analysis is NOT included in summary mode
      expect(result.analysis).toBeUndefined();
      expect(result.hints).toBeUndefined();
      expect(result.results).toBeUndefined();
    });

    it("should extract main topics based on word frequency", async () => {
      const { semanticSearch } = await import("../../core/search/search.js");
      vi.mocked(semanticSearch).mockResolvedValue(mockSearchResults);

      const input = {
        query: "TypeScript",
        goal: "Understand TypeScript features",
        options: {
          mode: "summary" as const,
        },
      };

      const result = await handleAgentQuery(input, options);

      expect(result.success).toBe(true);
      expect(result.summary?.mainTopics).toContain("typescript"); // Words are lowercased
      expect(result.summary?.mainTopics).toContain("types");
      expect(result.summary?.mainTopics.length).toBeLessThanOrEqual(3);
    });

    it("should assess coverage based on goal keywords", async () => {
      const { semanticSearch } = await import("../../core/search/search.js");
      vi.mocked(semanticSearch).mockResolvedValue(mockSearchResults);

      const input = {
        query: "functions",
        goal: "functions and classes", // Simplified goal to match what's in results
        options: {
          mode: "summary" as const,
        },
      };

      const result = await handleAgentQuery(input, options);

      expect(result.success).toBe(true);
      // Both "functions" and "classes" are in the results
      expect(result.summary?.coverageStatus).toBe("complete");
    });

    it("should determine quality level based on average score", async () => {
      const lowScoreResults: VectorSearchResult[] = [
        { ...mockSearchResults[0], score: 0.3 } as VectorSearchResult,
        { ...mockSearchResults[1], score: 0.25 } as VectorSearchResult,
        { ...mockSearchResults[2], score: 0.2 } as VectorSearchResult,
      ];

      const { semanticSearch } = await import("../../core/search/search.js");
      vi.mocked(semanticSearch).mockResolvedValue(lowScoreResults);

      const input = {
        query: "test",
        goal: "find test",
        options: {
          mode: "summary" as const,
        },
      };

      const result = await handleAgentQuery(input, options);

      expect(result.success).toBe(true);
      expect(result.summary?.qualityLevel).toBe("low");
      expect(result.primaryAction?.action).toContain("broaden");
    });

    it("should default to summary mode when mode is not specified", async () => {
      const { semanticSearch } = await import("../../core/search/search.js");
      vi.mocked(semanticSearch).mockResolvedValue(mockSearchResults);

      const input = {
        query: "TypeScript",
        goal: "Learn TypeScript",
        // No mode specified - should default to summary
      };

      const result = await handleAgentQuery(input, options);

      expect(result.success).toBe(true);
      expect(result.summary).toBeDefined();
      expect(result.estimatedTokens).toBeLessThan(5000);
    });
  });

  describe("Detailed Mode", () => {
    it("should return detailed results when mode is 'detailed'", async () => {
      const { semanticSearch } = await import("../../core/search/search.js");
      vi.mocked(semanticSearch).mockResolvedValue(mockSearchResults);

      const input = {
        query: "TypeScript",
        goal: "Analyze TypeScript usage",
        options: {
          mode: "detailed" as const,
        },
      };

      const result = await handleAgentQuery(input, options);

      expect(result.success).toBe(true);
      expect(result.results).toBeDefined();
      expect(result.results?.length).toBeLessThanOrEqual(5);
      expect(result.analysis).toBeDefined();
      expect(result.analysis?.metrics).toBeDefined();
      expect(result.hints).toBeDefined();
      expect(result.estimatedTokens).toBeLessThan(15000);
    });
  });

  describe("Full Mode", () => {
    it("should return complete information when mode is 'full'", async () => {
      const { semanticSearch } = await import("../../core/search/search.js");
      vi.mocked(semanticSearch).mockResolvedValue(mockSearchResults);

      const input = {
        query: "TypeScript",
        goal: "Complete analysis",
        options: {
          mode: "full" as const,
        },
      };

      const result = await handleAgentQuery(input, options);

      expect(result.success).toBe(true);
      expect(result.results).toBeDefined();
      expect(result.analysis).toBeDefined();
      expect(result.hints).toBeDefined();
      expect(result.progress).toBeDefined();
      // Full mode may exceed token limits
      expect(result.estimatedTokens).toBeGreaterThan(0);
    });
  });

  describe("Schema Validation", () => {
    it("should validate mode parameter", () => {
      const validInput = {
        query: "test",
        goal: "test goal",
        options: {
          mode: "summary" as const,
          k: 5,
        },
      };

      const result = agentQueryToolSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.options?.mode).toBe("summary");
      }
    });

    it("should reject invalid mode values", () => {
      const invalidInput = {
        query: "test",
        goal: "test goal",
        options: {
          mode: "invalid" as unknown as "summary",
        },
      };

      const result = agentQueryToolSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  describe("Pagination", () => {
    it("should return nextCursor when results exceed page size", async () => {
      // Create more results than page size
      const manyResults: VectorSearchResult[] = Array.from(
        { length: 15 },
        (_, i) => ({
          id: `result-${i}`,
          content: `Content ${i} about TypeScript`,
          score: 0.9 - i * 0.01,
          metadata: { sourceType: "file", title: `file${i}.ts` },
        }),
      );

      const { semanticSearch } = await import("../../core/search/search.js");
      vi.mocked(semanticSearch).mockResolvedValue(manyResults);

      const input = {
        query: "TypeScript",
        goal: "Learn TypeScript",
        options: {
          mode: "summary" as const,
          pageSize: 10, // Request specific page size
        },
      };

      const result = await handleAgentQuery(input, options);

      expect(result.success).toBe(true);
      expect(result.nextCursor).toBeDefined();
      expect(result.summary?.totalResults).toBeLessThanOrEqual(10);
    });

    it("should continue from cursor position", async () => {
      const allResults: VectorSearchResult[] = Array.from(
        { length: 20 },
        (_, i) => ({
          id: `result-${i}`,
          content: `Content ${i}`,
          score: 0.9 - i * 0.01,
          metadata: { sourceType: "file", title: `file${i}.ts` },
        }),
      );

      const { semanticSearch } = await import("../../core/search/search.js");
      vi.mocked(semanticSearch).mockResolvedValue(allResults);

      // First page
      const firstInput = {
        query: "test",
        goal: "test goal",
        options: {
          mode: "summary" as const,
          pageSize: 10,
        },
      };

      const firstResult = await handleAgentQuery(firstInput, options);
      expect(firstResult.nextCursor).toBeDefined();

      // Second page using cursor
      const secondInput = {
        query: "test",
        goal: "test goal",
        cursor: firstResult.nextCursor,
        options: {
          mode: "summary" as const,
          pageSize: 10,
        },
      };

      const secondResult = await handleAgentQuery(secondInput, options);
      expect(secondResult.success).toBe(true);
      // Should get different results
      expect(secondResult.summary).toBeDefined();
    });

    it("should not return nextCursor on last page", async () => {
      const fewResults: VectorSearchResult[] = [
        {
          id: "1",
          content: "Small result set",
          score: 0.9,
          metadata: { sourceType: "file", title: "test.ts" },
        },
      ];

      const { semanticSearch } = await import("../../core/search/search.js");
      vi.mocked(semanticSearch).mockResolvedValue(fewResults);

      const input = {
        query: "test",
        goal: "test goal",
        options: {
          mode: "summary" as const,
          pageSize: 10,
        },
      };

      const result = await handleAgentQuery(input, options);

      expect(result.success).toBe(true);
      expect(result.nextCursor).toBeUndefined();
    });

    it("should handle invalid cursor gracefully", async () => {
      const input = {
        query: "test",
        goal: "test goal",
        cursor: "invalid-cursor-xxx",
        options: {
          mode: "summary" as const,
        },
      };

      const result = await handleAgentQuery(input, options);

      expect(result.success).toBe(false);
      expect(result.message).toContain("Invalid cursor");
    });

    it("should validate cursor parameter in schema", () => {
      const inputWithCursor = {
        query: "test",
        goal: "test goal",
        cursor: "valid-cursor-string",
        options: {
          pageSize: 10,
        },
      };

      const result = agentQueryToolSchema.safeParse(inputWithCursor);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cursor).toBe("valid-cursor-string");
      }
    });
  });
});

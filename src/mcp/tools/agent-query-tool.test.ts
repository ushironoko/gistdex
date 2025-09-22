import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
  mock,
} from "bun:test";
import type { DatabaseService } from "../../core/database/database-service.js";
import type { VectorSearchResult } from "../../core/vector-db/adapters/types.js";
import { agentQueryToolSchema } from "../schemas/validation.js";
import {
  type AgentQueryOptions,
  handleAgentQuery,
} from "./agent-query-tool.js";

// Mock the core modules
mock.module("../../core/search/search.js", () => ({
  semanticSearch: jest.fn(),
  hybridSearch: jest.fn(),
  rerankResults: jest.fn((_query, results) => results),
}));

mock.module("../utils/metadata-generator.js", () => ({
  analyzeSemanticCoherence: jest.fn(() => ({
    coherence: 0.8,
    diversity: 0.7,
    topicClusters: [{ topic: "test", confidence: 0.9, resultIndices: [0, 1] }],
  })),
  analyzeContentTypes: jest.fn(() => ({
    contentTypes: [
      { type: "code", count: 3, percentage: 0.6 },
      { type: "documentation", count: 1, percentage: 0.2 },
      { type: "example", count: 1, percentage: 0.2 },
    ],
    codeLanguages: ["TypeScript"],
    hasExamples: true,
    hasImplementation: true,
  })),
  extractMainTopics: jest.fn(() => ["typescript", "functions", "types"]),
  analyzeContentCharacteristics: jest.fn(() => ({
    predominantType: "code",
    hasExamples: true,
    hasImplementation: true,
    codeLanguages: ["TypeScript"],
    completeness: 0.8,
  })),
}));

describe("agent-query-tool", () => {
  let mockService: DatabaseService;
  let options: AgentQueryOptions;
  let mockSearchResults: VectorSearchResult[];

  beforeEach(() => {
    jest.clearAllMocks();

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
      initialize: jest.fn(),
      close: jest.fn(),
      saveItem: jest.fn(),
      saveItems: jest.fn(),
      searchItems: jest.fn().mockResolvedValue(mockSearchResults),
      countItems: jest.fn(),
      getStats: jest.fn(),
      listItems: jest.fn(),
      getAdapterInfo: jest.fn(),
    };

    options = {
      service: mockService,
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Summary Mode", () => {
    it("should return summary response when mode is 'summary'", async () => {
      const { semanticSearch } = await import("../../core/search/search.js");
      (semanticSearch as any).mockResolvedValue(mockSearchResults);

      const input = {
        query: "TypeScript functions",
        goal: "Find TypeScript function implementations",
        visitedCache: true,
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
      (semanticSearch as any).mockResolvedValue(mockSearchResults);

      const input = {
        visitedCache: true,
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
      (semanticSearch as any).mockResolvedValue(mockSearchResults);

      const input = {
        visitedCache: true,
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
      (semanticSearch as any).mockResolvedValue(lowScoreResults);

      const input = {
        visitedCache: true,
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
      (semanticSearch as any).mockResolvedValue(mockSearchResults);

      const input = {
        visitedCache: true,
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
      (semanticSearch as any).mockResolvedValue(mockSearchResults);

      const input = {
        visitedCache: true,
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

    it("should exclude embedding arrays from results in detailed mode", async () => {
      const { semanticSearch } = await import("../../core/search/search.js");

      // Create mock results with embedding arrays
      const mockResultsWithEmbedding = mockSearchResults.map((result) => ({
        ...result,
        embedding: new Array(768).fill(0.1),
      })) as Array<VectorSearchResult & { embedding: number[] }>;

      (semanticSearch as any).mockResolvedValue(mockResultsWithEmbedding);

      const input = {
        visitedCache: true,
        query: "TypeScript",
        goal: "Analyze TypeScript usage",
        options: {
          mode: "detailed" as const,
        },
      };

      const result = await handleAgentQuery(input, options);

      expect(result.success).toBe(true);
      expect(result.results).toBeDefined();

      // Verify that embeddings are excluded from all results
      result.results?.forEach((res) => {
        expect(res).not.toHaveProperty("embedding");
        // Verify other properties are still present
        expect(res).toHaveProperty("id");
        expect(res).toHaveProperty("content");
        expect(res).toHaveProperty("score");
        expect(res).toHaveProperty("metadata");
      });

      // Token count should be significantly lower without embeddings
      expect(result.estimatedTokens).toBeLessThan(15000);
    });
  });

  describe("Full Mode", () => {
    it("should return complete information when mode is 'full'", async () => {
      const { semanticSearch } = await import("../../core/search/search.js");
      (semanticSearch as any).mockResolvedValue(mockSearchResults);

      const input = {
        visitedCache: true,
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

    it("should exclude embedding arrays from results in full mode", async () => {
      const { semanticSearch } = await import("../../core/search/search.js");

      // Create mock results with embedding arrays
      const mockResultsWithEmbedding = mockSearchResults.map((result) => ({
        ...result,
        embedding: new Array(768).fill(0.1),
      })) as Array<VectorSearchResult & { embedding: number[] }>;

      (semanticSearch as any).mockResolvedValue(mockResultsWithEmbedding);

      const input = {
        visitedCache: true,
        query: "TypeScript",
        goal: "Complete analysis",
        options: {
          mode: "full" as const,
        },
      };

      const result = await handleAgentQuery(input, options);

      expect(result.success).toBe(true);
      expect(result.results).toBeDefined();

      // Verify that embeddings are excluded from all results
      result.results?.forEach((res) => {
        expect(res).not.toHaveProperty("embedding");
        // Verify other properties are still present
        expect(res).toHaveProperty("id");
        expect(res).toHaveProperty("content");
        expect(res).toHaveProperty("score");
        expect(res).toHaveProperty("metadata");
      });

      // Token count should be reasonable without embeddings
      expect(result.estimatedTokens).toBeGreaterThan(0);
      // Should be much less than with embeddings (768 * 3 results * ~4 chars per float = ~9000 tokens just for embeddings)
      expect(result.estimatedTokens).toBeLessThan(50000);
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

    it("should accept visitedCache as top-level parameter", () => {
      const input = {
        query: "test",
        goal: "test goal",
        visitedCache: true,
      };

      const result = agentQueryToolSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.visitedCache).toBe(true);
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
      (semanticSearch as any).mockResolvedValue(manyResults);

      const input = {
        visitedCache: true,
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
      (semanticSearch as any).mockResolvedValue(allResults);

      // First page
      const firstInput = {
        query: "test",
        goal: "test goal",
        visitedCache: true,
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
        visitedCache: true,
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
      (semanticSearch as any).mockResolvedValue(fewResults);

      const input = {
        visitedCache: true,
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
        visitedCache: true,
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

import { describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../../core/database/database-service.js";
import {
  buildStructuredResult,
  type ChainResult,
  executeQueryChain,
  type QueryChain,
} from "./query-chain.js";

describe("query-chain", () => {
  describe("executeQueryChain", () => {
    it("should execute query stages sequentially", async () => {
      const mockService = {
        search: vi.fn(),
        hybridSearch: vi.fn(),
        searchItems: vi.fn(),
      };

      // Mock searchItems which is called by semanticSearch and hybridSearch
      mockService.searchItems
        .mockResolvedValueOnce([
          { content: "Result 1 from stage 1", score: 0.9 },
          { content: "Result 2 from stage 1", score: 0.8 },
        ])
        .mockResolvedValueOnce([
          { content: "Result 1 from stage 2", score: 0.95 },
        ])
        .mockResolvedValueOnce([
          { content: "Detailed result from stage 3", score: 0.99 },
        ]);

      const chain: QueryChain = {
        topic: "test-topic",
        stages: [
          {
            query: "initial broad search",
            options: { hybrid: true, k: 20 },
            description: "Stage 1: Broad keyword discovery",
          },
          {
            query: "refined search based on stage 1",
            options: { hybrid: false, k: 10 },
            description: "Stage 2: Semantic search",
            processResult: (results) => {
              // Extract keywords from stage 1
              return results;
            },
          },
          {
            query: "specific detail search",
            options: { hybrid: false, k: 5, section: true },
            description: "Stage 3: Get full sections",
          },
        ],
      };

      const result = await executeQueryChain(
        chain,
        mockService as unknown as DatabaseService,
      );

      expect(result).toBeDefined();
      expect(result.topic).toBe("test-topic");
      expect(result.stages).toHaveLength(3);
      expect(result.stages[0]?.stageNumber).toBe(1);
      expect(result.stages[0]?.description).toBe(
        "Stage 1: Broad keyword discovery",
      );
      expect(result.stages[0]?.results).toHaveLength(2);
      expect(mockService.searchItems).toHaveBeenCalledTimes(3);
    });

    it("should handle empty results gracefully", async () => {
      const mockService = {
        searchItems: vi.fn().mockResolvedValue([]),
      };

      const chain: QueryChain = {
        topic: "empty-results",
        stages: [
          {
            query: "search with no results",
            options: { hybrid: true, k: 10 },
          },
        ],
      };

      const result = await executeQueryChain(
        chain,
        mockService as unknown as DatabaseService,
      );

      expect(result).toBeDefined();
      expect(result.stages[0]?.results).toEqual([]);
      expect(result.combinedResults).toEqual([]);
    });

    it("should combine results from all stages", async () => {
      const mockService = {
        searchItems: vi.fn(),
      };

      mockService.searchItems
        .mockResolvedValueOnce([{ content: "A", score: 0.9 }])
        .mockResolvedValueOnce([{ content: "B", score: 0.8 }])
        .mockResolvedValueOnce([{ content: "C", score: 0.7 }]);

      const chain: QueryChain = {
        topic: "combined",
        stages: [
          { query: "q1", options: { k: 1 } },
          { query: "q2", options: { k: 1 } },
          { query: "q3", options: { k: 1 } },
        ],
      };

      const result = await executeQueryChain(
        chain,
        mockService as unknown as DatabaseService,
      );

      expect(result.combinedResults).toHaveLength(3);
      expect(result.combinedResults.map((r) => r.content)).toEqual([
        "A",
        "B",
        "C",
      ]);
    });
  });

  describe("buildStructuredResult", () => {
    it("should build structured knowledge from chain results", () => {
      const chainResult: ChainResult = {
        topic: "typescript-architecture",
        stages: [
          {
            stageNumber: 1,
            query: "typescript architecture",
            description: "Broad search",
            results: [
              { content: "TypeScript uses modules", score: 0.9 },
              { content: "Classes and interfaces", score: 0.8 },
            ],
          },
          {
            stageNumber: 2,
            query: "typescript modules",
            description: "Module details",
            results: [{ content: "ES modules are standard", score: 0.95 }],
          },
        ],
        combinedResults: [
          { content: "TypeScript uses modules", score: 0.9 },
          { content: "Classes and interfaces", score: 0.8 },
          { content: "ES modules are standard", score: 0.95 },
        ],
        timestamp: new Date().toISOString(),
      };

      const structured = buildStructuredResult(chainResult);

      expect(structured.topic).toBe("typescript-architecture");
      expect(structured.content).toContain("# TypeScript Architecture");
      expect(structured.content).toContain("## Query Chain Results");
      expect(structured.content).toContain("### Stage 1: Broad search");
      expect(structured.content).toContain("TypeScript uses modules");
      expect(structured.metadata.queryCount).toBe(2);
      expect(structured.metadata.resultCount).toBe(3);
    });

    it("should handle empty stages gracefully", () => {
      const chainResult: ChainResult = {
        topic: "empty",
        stages: [],
        combinedResults: [],
        timestamp: new Date().toISOString(),
      };

      const structured = buildStructuredResult(chainResult);

      expect(structured.topic).toBe("empty");
      expect(structured.content).toContain("# Empty");
      expect(structured.content).toContain("No results found");
      expect(structured.metadata.queryCount).toBe(0);
      expect(structured.metadata.resultCount).toBe(0);
    });

    it("should format topic name properly", () => {
      const chainResult: ChainResult = {
        topic: "api-endpoints-documentation",
        stages: [
          {
            stageNumber: 1,
            query: "api",
            results: [{ content: "REST API", score: 0.9 }],
          },
        ],
        combinedResults: [{ content: "REST API", score: 0.9 }],
        timestamp: new Date().toISOString(),
      };

      const structured = buildStructuredResult(chainResult);

      expect(structured.content).toContain("# Api Endpoints Documentation");
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRateLimitedFetch,
  GitHubRateLimiter,
  type RateLimitInfo,
} from "./github-rate-limiter.js";

// Mock global fetch
global.fetch = vi.fn() as unknown as typeof fetch;

describe("github-rate-limiter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("GitHubRateLimiter", () => {
    it("should extract rate limit info from headers", () => {
      const rateLimiter = new GitHubRateLimiter();
      const headers = new Headers({
        "X-RateLimit-Limit": "60",
        "X-RateLimit-Remaining": "45",
        "X-RateLimit-Reset": "1704067200",
        "X-RateLimit-Used": "15",
      });

      const response = new Response(null, { headers });
      const info = rateLimiter.extractRateLimitInfo(response);

      expect(info).toEqual({
        limit: 60,
        remaining: 45,
        reset: 1704067200,
        used: 15,
      });
    });

    it("should return null for missing headers", () => {
      const rateLimiter = new GitHubRateLimiter();
      const headers = new Headers();
      const response = new Response(null, { headers });
      const info = rateLimiter.extractRateLimitInfo(response);

      expect(info).toBe(null);
    });

    it("should trigger throttling when threshold is reached", () => {
      const onThrottleStart = vi.fn();
      const rateLimiter = new GitHubRateLimiter({
        throttleThreshold: 10,
        onThrottleStart,
      });

      const headers = new Headers({
        "X-RateLimit-Limit": "60",
        "X-RateLimit-Remaining": "8",
        "X-RateLimit-Reset": "1704067200",
      });

      const response = new Response(null, { headers });
      rateLimiter.updateFromResponse(response);

      expect(onThrottleStart).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 60,
          remaining: 8,
          reset: 1704067200,
        }),
      );
      expect(rateLimiter.isCurrentlyThrottling()).toBe(true);
    });

    it("should trigger warning when approaching limit", () => {
      const onRateLimitWarning = vi.fn();
      const rateLimiter = new GitHubRateLimiter({
        throttleThreshold: 10,
        onRateLimitWarning,
      });

      const headers = new Headers({
        "X-RateLimit-Limit": "60",
        "X-RateLimit-Remaining": "15",
        "X-RateLimit-Reset": "1704067200",
      });

      const response = new Response(null, { headers });
      rateLimiter.updateFromResponse(response);

      expect(onRateLimitWarning).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 60,
          remaining: 15,
        }),
      );
    });

    it("should wait until reset when limit is exceeded", async () => {
      const onWaitingForReset = vi.fn();
      const rateLimiter = new GitHubRateLimiter({
        waitOnReset: true,
        onWaitingForReset,
      });

      // Set current time
      const currentTime = Date.now();
      vi.setSystemTime(currentTime);

      // Update with rate limit exceeded
      const resetTime = Math.floor((currentTime + 60000) / 1000); // 1 minute from now
      const headers = new Headers({
        "X-RateLimit-Limit": "60",
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": resetTime.toString(),
      });

      const response = new Response(null, { headers });
      rateLimiter.updateFromResponse(response);

      // Start waiting
      const waitPromise = rateLimiter.checkAndWait();

      // Should call waiting callback
      expect(onWaitingForReset).toHaveBeenCalled();

      // Advance time
      vi.advanceTimersByTime(60000);

      // Wait should complete
      await waitPromise;
    });

    it("should add delay when throttling", async () => {
      const rateLimiter = new GitHubRateLimiter({
        throttleThreshold: 10,
        throttleDelay: 500,
      });

      // Set rate limit info to trigger throttling
      const headers = new Headers({
        "X-RateLimit-Limit": "60",
        "X-RateLimit-Remaining": "5",
        "X-RateLimit-Reset": "1704067200",
      });

      const response = new Response(null, { headers });
      rateLimiter.updateFromResponse(response);

      // Start waiting
      const waitPromise = rateLimiter.checkAndWait();

      // Advance time by throttle delay
      vi.advanceTimersByTime(500);

      // Wait should complete
      await waitPromise;
    });
  });

  describe("createRateLimitedFetch", () => {
    it("should update rate limit info after fetch", async () => {
      const mockFetch = vi.mocked(global.fetch);
      const headers = new Headers({
        "X-RateLimit-Limit": "60",
        "X-RateLimit-Remaining": "45",
        "X-RateLimit-Reset": "1704067200",
      });

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: "test" }), {
          status: 200,
          headers,
        }),
      );

      const { fetch: rateLimitedFetch, getRateLimitInfo } =
        createRateLimitedFetch();

      await rateLimitedFetch("https://api.github.com/test");

      const info = getRateLimitInfo();
      expect(info).toEqual({
        limit: 60,
        remaining: 45,
        reset: 1704067200,
        used: 0,
      });
    });

    it("should throw error for rate limit exceeded", async () => {
      const mockFetch = vi.mocked(global.fetch);
      const headers = new Headers({
        "X-RateLimit-Limit": "60",
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": "1704067200",
      });

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
          status: 403,
          headers,
        }),
      );

      const { fetch: rateLimitedFetch } = createRateLimitedFetch();

      await expect(
        rateLimitedFetch("https://api.github.com/test"),
      ).rejects.toThrow("GitHub API rate limit exceeded");
    });

    it("should apply throttling between requests", async () => {
      const mockFetch = vi.mocked(global.fetch);

      // First response triggers throttling
      const headers1 = new Headers({
        "X-RateLimit-Limit": "60",
        "X-RateLimit-Remaining": "8",
        "X-RateLimit-Reset": "1704067200",
      });

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: "test1" }), {
          status: 200,
          headers: headers1,
        }),
      );

      // Second response
      const headers2 = new Headers({
        "X-RateLimit-Limit": "60",
        "X-RateLimit-Remaining": "7",
        "X-RateLimit-Reset": "1704067200",
      });

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: "test2" }), {
          status: 200,
          headers: headers2,
        }),
      );

      const { fetch: rateLimitedFetch } = createRateLimitedFetch({
        throttleThreshold: 10,
        throttleDelay: 1000,
      });

      // First request triggers throttling
      await rateLimitedFetch("https://api.github.com/test1");

      // Second request should be delayed
      const fetchPromise = rateLimitedFetch("https://api.github.com/test2");

      // Advance timers to complete the delay
      vi.advanceTimersByTime(1000);

      await fetchPromise;

      // Verify both requests were made
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("formatRateLimitInfo", () => {
    it("should format rate limit info correctly", () => {
      const info: RateLimitInfo = {
        limit: 60,
        remaining: 45,
        reset: 1704067200,
        used: 15,
      };

      const formatted = GitHubRateLimiter.formatRateLimitInfo(info);
      expect(formatted).toContain("45/60");
      expect(formatted).toContain("75.0%");
      expect(formatted).toContain("Resets at");
    });
  });
});

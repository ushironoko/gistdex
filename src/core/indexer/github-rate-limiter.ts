/**
 * GitHub API Rate Limit Manager
 * Monitors X-RateLimit headers and implements throttling
 */

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp
  used: number;
}

export interface RateLimitOptions {
  /** Minimum remaining requests before throttling (default: 10) */
  throttleThreshold?: number;
  /** Delay between requests when throttling in ms (default: 1000) */
  throttleDelay?: number;
  /** Whether to wait until reset when limit is exceeded (default: true) */
  waitOnReset?: boolean;
  /** Callback for rate limit warnings */
  onRateLimitWarning?: (info: RateLimitInfo) => void;
  /** Callback for when throttling starts */
  onThrottleStart?: (info: RateLimitInfo) => void;
  /** Callback for when waiting for reset */
  onWaitingForReset?: (resetTime: Date) => void;
}

export class GitHubRateLimiter {
  private rateLimitInfo: RateLimitInfo | null = null;
  private isThrottling = false;
  private readonly options: Required<RateLimitOptions>;

  constructor(options: RateLimitOptions = {}) {
    this.options = {
      throttleThreshold: options.throttleThreshold ?? 10,
      throttleDelay: options.throttleDelay ?? 1000,
      waitOnReset: options.waitOnReset ?? true,
      onRateLimitWarning: options.onRateLimitWarning ?? (() => {}),
      onThrottleStart: options.onThrottleStart ?? (() => {}),
      onWaitingForReset: options.onWaitingForReset ?? (() => {}),
    };
  }

  /**
   * Extract rate limit info from response headers
   */
  extractRateLimitInfo(response: Response): RateLimitInfo | null {
    const limit = response.headers.get("X-RateLimit-Limit");
    const remaining = response.headers.get("X-RateLimit-Remaining");
    const reset = response.headers.get("X-RateLimit-Reset");
    const used = response.headers.get("X-RateLimit-Used");

    if (limit && remaining && reset) {
      return {
        limit: parseInt(limit, 10),
        remaining: parseInt(remaining, 10),
        reset: parseInt(reset, 10),
        used: parseInt(used || "0", 10),
      };
    }

    return null;
  }

  /**
   * Update rate limit info from response
   */
  updateFromResponse(response: Response): void {
    const info = this.extractRateLimitInfo(response);
    if (info) {
      this.rateLimitInfo = info;

      // Check if we should start throttling
      if (
        info.remaining <= this.options.throttleThreshold &&
        !this.isThrottling
      ) {
        this.isThrottling = true;
        this.options.onThrottleStart(info);
      }

      // Warn if getting close to limit
      if (info.remaining <= this.options.throttleThreshold * 2) {
        this.options.onRateLimitWarning(info);
      }
    }
  }

  /**
   * Check if we should wait before next request
   */
  async checkAndWait(): Promise<void> {
    if (!this.rateLimitInfo) {
      return;
    }

    // If rate limit exceeded, wait until reset
    if (this.rateLimitInfo.remaining === 0 && this.options.waitOnReset) {
      const resetTime = new Date(this.rateLimitInfo.reset * 1000);
      const now = Date.now();
      const waitTime = resetTime.getTime() - now;

      if (waitTime > 0) {
        this.options.onWaitingForReset(resetTime);
        await this.sleep(waitTime);
        this.isThrottling = false;
      }
    }
    // If throttling, add delay between requests
    else if (this.isThrottling) {
      await this.sleep(this.options.throttleDelay);
    }
  }

  /**
   * Get current rate limit info
   */
  getRateLimitInfo(): RateLimitInfo | null {
    return this.rateLimitInfo;
  }

  /**
   * Check if currently throttling
   */
  isCurrentlyThrottling(): boolean {
    return this.isThrottling;
  }

  /**
   * Reset throttling state
   */
  resetThrottling(): void {
    this.isThrottling = false;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Format rate limit info for display
   */
  static formatRateLimitInfo(info: RateLimitInfo): string {
    const resetTime = new Date(info.reset * 1000);
    const percentage = ((info.remaining / info.limit) * 100).toFixed(1);
    return `Rate Limit: ${info.remaining}/${info.limit} (${percentage}%) - Resets at ${resetTime.toLocaleTimeString()}`;
  }
}

/**
 * Create a fetch wrapper with rate limiting
 */
export function createRateLimitedFetch(options: RateLimitOptions = {}): {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  getRateLimitInfo: () => RateLimitInfo | null;
} {
  const rateLimiter = new GitHubRateLimiter(options);

  const rateLimitedFetch = async (
    url: string,
    init?: RequestInit,
  ): Promise<Response> => {
    // Wait if necessary before making request
    await rateLimiter.checkAndWait();

    // Make the request
    const response = await fetch(url, init);

    // Update rate limit info
    rateLimiter.updateFromResponse(response);

    // Handle rate limit errors
    if (response.status === 403) {
      const rateLimitRemaining = response.headers.get("X-RateLimit-Remaining");
      if (rateLimitRemaining === "0") {
        const resetTime = response.headers.get("X-RateLimit-Reset");
        if (resetTime) {
          const reset = new Date(parseInt(resetTime, 10) * 1000);
          throw new Error(
            `GitHub API rate limit exceeded. Resets at ${reset.toLocaleTimeString()}`,
          );
        }
      }
    }

    return response;
  };

  return {
    fetch: rateLimitedFetch,
    getRateLimitInfo: () => rateLimiter.getRateLimitInfo(),
  };
}

import type { ItemMetadata } from "../database/database-service.js";
import {
  createRateLimitedFetch,
  type RateLimitInfo,
  type RateLimitOptions,
} from "./github-rate-limiter.js";

export interface GitHubTreeItem {
  path: string;
  mode: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
  url: string;
}

export interface GitHubTreeResponse {
  sha: string;
  url: string;
  tree: GitHubTreeItem[];
  truncated: boolean;
}

export interface GitHubFileInfo {
  path: string;
  sha: string;
  size: number;
}

export interface GitHubFetchOptions extends RateLimitOptions {
  onProgress?: (message: string) => void;
}

// Create a shared rate-limited fetch instance for all GitHub API calls
let rateLimitedFetch: ReturnType<typeof createRateLimitedFetch> | null = null;

/**
 * Initialize or get the rate-limited fetch instance
 */
function getRateLimitedFetch(options?: GitHubFetchOptions) {
  if (!rateLimitedFetch) {
    rateLimitedFetch = createRateLimitedFetch({
      throttleThreshold: 10,
      throttleDelay: 1000,
      waitOnReset: true,
      onRateLimitWarning: (info) => {
        if (options?.onProgress) {
          const percentage = ((info.remaining / info.limit) * 100).toFixed(1);
          options.onProgress(
            `⚠️ Rate limit warning: ${info.remaining}/${info.limit} requests remaining (${percentage}%)`,
          );
        }
        console.warn(
          `GitHub API rate limit warning: ${formatRateLimitInfo(info)}`,
        );
      },
      onThrottleStart: (info) => {
        if (options?.onProgress) {
          options.onProgress(
            "🚦 Starting to throttle requests due to rate limit",
          );
        }
        console.log(
          `Starting to throttle GitHub API requests: ${formatRateLimitInfo(info)}`,
        );
      },
      onWaitingForReset: (resetTime) => {
        if (options?.onProgress) {
          options.onProgress(
            `⏳ Rate limit exceeded. Waiting until ${resetTime.toLocaleTimeString()}...`,
          );
        }
        console.log(
          `Waiting for rate limit reset at ${resetTime.toLocaleTimeString()}`,
        );
      },
      ...options,
    });
  }
  return rateLimitedFetch;
}

/**
 * Format rate limit info for display
 */
function formatRateLimitInfo(info: RateLimitInfo): string {
  const resetTime = new Date(info.reset * 1000);
  const percentage = ((info.remaining / info.limit) * 100).toFixed(1);
  return `${info.remaining}/${info.limit} (${percentage}%) - Resets at ${resetTime.toLocaleTimeString()}`;
}

/**
 * Get current rate limit info
 */
export function getCurrentRateLimitInfo(): RateLimitInfo | null {
  return rateLimitedFetch?.getRateLimitInfo() ?? null;
}

export async function fetchGitHubTree(
  owner: string,
  repo: string,
  branch: string = "main",
  options?: GitHubFetchOptions,
): Promise<GitHubFileInfo[]> {
  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
  const { fetch: rateLimitedFetchFn } = getRateLimitedFetch(options);

  const response = await rateLimitedFetchFn(treeUrl, {
    headers: {
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch GitHub tree: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as GitHubTreeResponse;

  if (data.truncated) {
    console.warn(
      "Warning: GitHub tree response was truncated. Some files may be missing.",
    );
  }

  // Filter only blob (file) items
  return data.tree
    .filter((item) => item.type === "blob")
    .map((item) => ({
      path: item.path,
      sha: item.sha,
      size: item.size || 0,
    }));
}

export async function fetchGitHubFileContent(
  owner: string,
  repo: string,
  path: string,
  options?: GitHubFetchOptions,
): Promise<{ content: string; metadata: ItemMetadata }> {
  const fileUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const { fetch: rateLimitedFetchFn } = getRateLimitedFetch(options);

  const response = await rateLimitedFetchFn(fileUrl, {
    headers: {
      Accept: "application/vnd.github.v3.raw",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch file ${path}: ${response.status} ${response.statusText}`,
    );
  }

  const content = await response.text();

  const metadata: ItemMetadata = {
    title: path.split("/").pop() || path,
    url: `https://github.com/${owner}/${repo}/blob/main/${path}`,
    sourceType: "github",
    owner,
    repo,
    branch: "main",
    path,
  };

  return { content, metadata };
}

/**
 * Fetch GitHub contents with rate limiting (for backward compatibility)
 */
export async function fetchGitHubContents(
  url: string,
  options?: GitHubFetchOptions,
): Promise<Response> {
  const { fetch: rateLimitedFetchFn } = getRateLimitedFetch(options);

  return rateLimitedFetchFn(url, {
    headers: {
      Accept: "application/vnd.github.v3+json",
    },
  });
}

/**
 * Fetch file raw content with rate limiting
 */
export async function fetchGitHubRawContent(
  url: string,
  options?: GitHubFetchOptions,
): Promise<string> {
  const { fetch: rateLimitedFetchFn } = getRateLimitedFetch(options);

  const response = await rateLimitedFetchFn(url);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch content: ${response.status} ${response.statusText}`,
    );
  }

  return response.text();
}

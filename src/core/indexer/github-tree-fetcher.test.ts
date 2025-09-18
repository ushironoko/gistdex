import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchGitHubFileContent,
  fetchGitHubTree,
} from "./github-tree-fetcher.js";

// Mock fetch globally
global.fetch = vi.fn() as unknown as typeof fetch;

// Mock console methods to suppress rate limit logs in tests
const originalConsoleWarn = console.warn;
const originalConsoleLog = console.log;

describe("github-tree-fetcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console output in tests
    console.warn = vi.fn();
    console.log = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Restore console methods
    console.warn = originalConsoleWarn;
    console.log = originalConsoleLog;
  });

  describe("fetchGitHubTree", () => {
    it("should fetch and parse GitHub tree", async () => {
      const mockTreeResponse = {
        sha: "abc123",
        url: "https://api.github.com/repos/owner/repo/git/trees/abc123",
        tree: [
          {
            path: "README.md",
            mode: "100644",
            type: "blob",
            sha: "def456",
            size: 1234,
            url: "https://api.github.com/repos/owner/repo/git/blobs/def456",
          },
          {
            path: "src",
            mode: "040000",
            type: "tree",
            sha: "ghi789",
            url: "https://api.github.com/repos/owner/repo/git/trees/ghi789",
          },
          {
            path: "src/index.ts",
            mode: "100644",
            type: "blob",
            sha: "jkl012",
            size: 5678,
            url: "https://api.github.com/repos/owner/repo/git/blobs/jkl012",
          },
        ],
        truncated: false,
      };

      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTreeResponse,
      } as Response);

      const result = await fetchGitHubTree("owner", "repo", "main");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/owner/repo/git/trees/main?recursive=1",
        {
          headers: {
            Accept: "application/vnd.github.v3+json",
          },
        },
      );

      expect(result).toEqual([
        {
          path: "README.md",
          sha: "def456",
          size: 1234,
        },
        {
          path: "src/index.ts",
          sha: "jkl012",
          size: 5678,
        },
      ]);
    });

    it("should handle API errors", async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as Response);

      await expect(
        fetchGitHubTree("owner", "repo", "main"),
      ).rejects.toThrowError("Failed to fetch GitHub tree: 404 Not Found");
    });

    it("should warn on truncated response", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const mockTreeResponse = {
        sha: "abc123",
        url: "https://api.github.com/repos/owner/repo/git/trees/abc123",
        tree: [
          {
            path: "file.txt",
            mode: "100644",
            type: "blob",
            sha: "def456",
            size: 100,
            url: "https://api.github.com/repos/owner/repo/git/blobs/def456",
          },
        ],
        truncated: true,
      };

      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTreeResponse,
      } as Response);

      await fetchGitHubTree("owner", "repo", "main");

      expect(consoleSpy).toHaveBeenCalledWith(
        "Warning: GitHub tree response was truncated. Some files may be missing.",
      );
    });
  });

  describe("fetchGitHubFileContent", () => {
    it("should fetch file content and metadata", async () => {
      const mockContent = "console.log('Hello, World!');";
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockContent,
      } as Response);

      const result = await fetchGitHubFileContent(
        "owner",
        "repo",
        "src/index.ts",
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/owner/repo/contents/src/index.ts",
        {
          headers: {
            Accept: "application/vnd.github.v3.raw",
          },
        },
      );

      expect(result).toEqual({
        content: mockContent,
        metadata: {
          title: "index.ts",
          url: "https://github.com/owner/repo/blob/main/src/index.ts",
          sourceType: "github",
          owner: "owner",
          repo: "repo",
          branch: "main",
          path: "src/index.ts",
        },
      });
    });

    it("should handle file fetch errors", async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: "Forbidden",
      } as Response);

      await expect(
        fetchGitHubFileContent("owner", "repo", "src/index.ts"),
      ).rejects.toThrowError(
        "Failed to fetch file src/index.ts: 403 Forbidden",
      );
    });

    it("should extract filename correctly from path", async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "content",
      } as Response);

      const result = await fetchGitHubFileContent(
        "owner",
        "repo",
        "deep/nested/path/file.md",
      );

      expect(result.metadata.title).toBe("file.md");
    });

    it("should handle root-level files", async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "content",
      } as Response);

      const result = await fetchGitHubFileContent("owner", "repo", "README.md");

      expect(result.metadata.title).toBe("README.md");
      expect(result.metadata.path).toBe("README.md");
    });
  });
});

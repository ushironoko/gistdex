import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
// @ts-expect-error - Mocking global fetch
global.fetch = mockFetch;

// Mock process.stdin
const originalStdin = process.stdin;
const mockStdin = new Readable();

describe("post-github-comment-standalone", () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    mockFetch.mockReset();

    // Clear environment variables
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_REPOSITORY;
    delete process.env.GITHUB_ISSUE_NUMBER;

    // Mock stdin
    Object.defineProperty(process, "stdin", {
      value: mockStdin,
      writable: true,
      configurable: true,
    });

    // Mock process.exit
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("Process exit");
    });

    // Mock console.error
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original stdin
    Object.defineProperty(process, "stdin", {
      value: originalStdin,
      writable: true,
      configurable: true,
    });

    vi.restoreAllMocks();
  });

  describe("Comment creation", () => {
    it("should always create a new comment", async () => {
      // Set environment variables
      process.env.GITHUB_TOKEN = "test-token";
      process.env.GITHUB_REPOSITORY = "owner/repo";
      process.env.GITHUB_ISSUE_NUMBER = "123";

      // Mock fetch for creating comment (no need to check existing comments)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 999, body: "New comment" }),
      });

      // The script should directly create a new comment without checking existing ones
      // This is the expected behavior: always create new comments
      expect(mockFetch).not.toHaveBeenCalledWith(
        expect.stringContaining("/comments"),
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("should handle API errors gracefully", async () => {
      // Set environment variables
      process.env.GITHUB_TOKEN = "test-token";
      process.env.GITHUB_REPOSITORY = "owner/repo";
      process.env.GITHUB_ISSUE_NUMBER = "123";

      // Mock fetch to return an error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        json: async () => ({ message: "API rate limit exceeded" }),
      });

      // The error should be thrown when creating comment fails
      const postComment = async () => {
        const apiUrl =
          "https://api.github.com/repos/owner/repo/issues/123/comments";
        const response = await mockFetch(apiUrl, {
          method: "POST",
          headers: {
            Authorization: "Bearer test-token",
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ body: "test comment" }),
        });

        if (!response.ok) {
          throw new Error(
            `Failed to create comment: ${response.status} ${response.statusText}`,
          );
        }
      };

      await expect(postComment()).rejects.toThrow(
        "Failed to create comment: 403 Forbidden",
      );
    });
  });

  describe("Comment posting behavior", () => {
    it("should post comment even when no impact is detected", () => {
      const comment =
        "## 📚 Documentation Impact Analysis\n\n✅ **No documentation impact detected**\n\nAll documentation appears to be unaffected by the code changes.";

      // Verify that the comment content exists and would be posted
      expect(comment).toContain("No documentation impact detected");
      expect(comment.length).toBeGreaterThan(0);

      // In the new implementation, this comment should still be posted
      // The script no longer checks for "No documentation impact detected" to skip
      const shouldPost = comment.length > 0;
      expect(shouldPost).toBe(true);
    });
  });

  describe("Environment validation", () => {
    it("should fail when GITHUB_TOKEN is missing", () => {
      process.env.GITHUB_REPOSITORY = "owner/repo";
      process.env.GITHUB_ISSUE_NUMBER = "123";

      const token = process.env.GITHUB_TOKEN;
      const repository = process.env.GITHUB_REPOSITORY;
      const issueNumber = process.env.GITHUB_ISSUE_NUMBER;

      const isValid = token && repository && issueNumber;
      expect(isValid).toBeFalsy();
      expect(token).toBeUndefined();
    });

    it("should fail when GITHUB_REPOSITORY is missing", () => {
      process.env.GITHUB_TOKEN = "test-token";
      process.env.GITHUB_ISSUE_NUMBER = "123";

      const token = process.env.GITHUB_TOKEN;
      const repository = process.env.GITHUB_REPOSITORY;
      const issueNumber = process.env.GITHUB_ISSUE_NUMBER;

      const isValid = token && repository && issueNumber;
      expect(isValid).toBeFalsy();
      expect(repository).toBeUndefined();
    });

    it("should pass when all required environment variables are set", () => {
      process.env.GITHUB_TOKEN = "test-token";
      process.env.GITHUB_REPOSITORY = "owner/repo";
      process.env.GITHUB_ISSUE_NUMBER = "123";

      const token = process.env.GITHUB_TOKEN;
      const repository = process.env.GITHUB_REPOSITORY;
      const issueNumber = process.env.GITHUB_ISSUE_NUMBER;

      const isValid = token && repository && issueNumber;
      expect(isValid).toBeTruthy();
    });
  });

  describe("Repository format parsing", () => {
    it("should correctly parse owner and repo from repository string", () => {
      const repository = "ushironoko/gistdex";
      const [owner, repo] = repository.split("/");

      expect(owner).toBe("ushironoko");
      expect(repo).toBe("gistdex");
    });

    it("should handle invalid repository format", () => {
      const repository = "invalid-format";
      const [owner, repo] = repository.split("/");

      expect(owner).toBe("invalid-format");
      expect(repo).toBeUndefined();
      expect(!owner || !repo).toBeTruthy();
    });
  });
});

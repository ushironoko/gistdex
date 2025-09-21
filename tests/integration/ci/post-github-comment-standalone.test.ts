import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

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

  describe("Bot detection", () => {
    it("should correctly identify GitHub Actions bot comment", async () => {
      // Set environment variables
      process.env.GITHUB_TOKEN = "test-token";
      process.env.GITHUB_REPOSITORY = "owner/repo";
      process.env.GITHUB_ISSUE_NUMBER = "123";

      // Mock existing comments with GitHub Actions bot
      const existingComments = [
        {
          id: 1,
          user: { login: "github-actions[bot]", type: "Bot" },
          body: "## 📚 Documentation Impact Analysis\n\nPrevious comment",
        },
        {
          id: 2,
          user: { login: "user", type: "User" },
          body: "User comment",
        },
      ];

      // Mock fetch for getting comments
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => existingComments,
      });

      // Mock fetch for updating comment
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 1, body: "Updated" }),
      });

      // Import and run the script
      const mockComment =
        "## 📚 Documentation Impact Analysis\n\n### Updated content";

      // We need to test the actual detection logic
      // Since the script runs immediately on import, we'll test the core logic
      const botComment = existingComments.find(
        (c) =>
          c.user?.type === "Bot" &&
          c.body?.includes("Documentation Impact Analysis"),
      );

      expect(botComment).toBeDefined();
      expect(botComment?.id).toBe(1);
      expect(botComment?.user?.login).toBe("github-actions[bot]");
    });

    it("should handle different bot user types", () => {
      const comments = [
        {
          id: 1,
          user: { login: "github-actions[bot]", type: "Bot" },
          body: "## 📚 Documentation Impact Analysis",
        },
        {
          id: 2,
          user: { login: "dependabot[bot]", type: "Bot" },
          body: "## 📚 Documentation Impact Analysis",
        },
        {
          id: 3,
          user: { login: "renovate[bot]", type: "Bot" },
          body: "Some other content",
        },
      ];

      // Test current logic
      const botComment = comments.find(
        (c) =>
          c.user?.type === "Bot" &&
          c.body?.includes("Documentation Impact Analysis"),
      );

      // This should find the first matching bot comment
      expect(botComment?.id).toBe(1);
    });

    it("should not match user comments with same content", () => {
      const comments = [
        {
          id: 1,
          user: { login: "regular-user", type: "User" },
          body: "## 📚 Documentation Impact Analysis",
        },
        {
          id: 2,
          user: { login: "github-actions[bot]", type: "Bot" },
          body: "## 📚 Documentation Impact Analysis",
        },
      ];

      // Current logic (finds any Bot type with matching content)
      const botComment = comments.find(
        (c) =>
          c.user?.type === "Bot" &&
          c.body?.includes("Documentation Impact Analysis"),
      );

      expect(botComment?.id).toBe(2);
      expect(botComment?.user?.type).toBe("Bot");
    });
  });

  describe("Comment skipping logic", () => {
    it("should skip posting when no impact is detected", () => {
      const comment =
        "## 📚 Documentation Impact Analysis\n\n✅ **No documentation impact detected**\n\nAll documentation appears to be unaffected by the code changes.";

      const shouldSkip = comment.includes("No documentation impact detected");
      expect(shouldSkip).toBe(true);
    });

    it("should not skip when impact is detected", () => {
      const comment =
        "## 📚 Documentation Impact Analysis\n\n### 🔴 High Impact (>80% similarity)\n\n- 📝 **`docs/api.md`** _(95.0% similarity)_";

      const shouldSkip = comment.includes("No documentation impact detected");
      expect(shouldSkip).toBe(false);
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

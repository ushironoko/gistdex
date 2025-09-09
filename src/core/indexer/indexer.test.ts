import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { DatabaseService } from "../database/database-service.js";
import { SecurityError } from "../security/security.js";
import {
  indexFile,
  indexFiles,
  indexGist,
  indexGitHubRepo,
  indexText,
} from "./indexer.js";

// Mock dependencies
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  glob: vi.fn(),
}));

vi.mock("../chunk/chunking.js", () => ({
  chunkText: vi.fn(),
  chunkTextWithCST: vi.fn(),
}));

vi.mock("../embedding/embedding.js", () => ({
  generateEmbeddingsBatch: vi.fn(),
}));

vi.mock("../security/security.js", () => ({
  SecurityError: class SecurityError extends Error {},
  validateFilePath: vi.fn(),
  validateGistUrl: vi.fn(),
  validateGitHubRepoUrl: vi.fn(),
}));

import { glob } from "node:fs/promises";
import { chunkTextWithCST } from "../chunk/chunking.js";
import { generateEmbeddingsBatch } from "../embedding/embedding.js";
import {
  validateFilePath,
  validateGistUrl,
  validateGitHubRepoUrl,
} from "../security/security.js";

describe("indexText", () => {
  let mockService: DatabaseService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockService = {
      initialize: vi.fn().mockResolvedValue(undefined),
      saveItem: vi.fn().mockResolvedValue("id1"),
      saveItems: vi.fn().mockResolvedValue(["id1", "id2"]),
      searchItems: vi.fn().mockResolvedValue([]),
      countItems: vi.fn().mockResolvedValue(0),
      listItems: vi.fn().mockResolvedValue([]),
      getStats: vi.fn().mockResolvedValue({ totalItems: 0, bySourceType: {} }),
      close: vi.fn().mockResolvedValue(undefined),
      getAdapterInfo: vi.fn().mockResolvedValue(null),
    } as const satisfies DatabaseService;
  });

  test("indexes text with chunks and embeddings", async () => {
    const chunks = ["chunk1", "chunk2"];
    const embeddings = [
      [0.1, 0.2],
      [0.3, 0.4],
    ];

    vi.mocked(chunkTextWithCST).mockResolvedValue(chunks);
    vi.mocked(generateEmbeddingsBatch).mockResolvedValue(embeddings);

    const result = await indexText(
      "test text",
      { title: "Test" },
      { chunkSize: 100, chunkOverlap: 10 },
      mockService,
    );

    expect(chunkTextWithCST).toHaveBeenCalledWith("test text", {
      size: 100,
      overlap: 10,
    });
    expect(generateEmbeddingsBatch).toHaveBeenCalledWith(chunks, {
      batchSize: 100,
      onProgress: expect.any(Function),
    });
    expect(mockService.saveItems).toHaveBeenCalled();
    expect(result).toEqual({
      itemsIndexed: 2,
      chunksCreated: 2,
      errors: [],
    });
  });

  test("handles empty chunks", async () => {
    vi.mocked(chunkTextWithCST).mockResolvedValue([]);

    const result = await indexText("test text", {}, {}, mockService);

    expect(result).toEqual({
      itemsIndexed: 0,
      chunksCreated: 0,
      errors: ["No chunks generated from text"],
    });
  });

  test("handles database save errors", async () => {
    vi.mocked(chunkTextWithCST).mockResolvedValue(["chunk1"]);
    vi.mocked(generateEmbeddingsBatch).mockResolvedValue([[0.1, 0.2]]);
    vi.mocked(mockService.saveItems).mockRejectedValue(new Error("DB error"));

    const result = await indexText("test text", {}, {}, mockService);

    expect(result).toEqual({
      itemsIndexed: 0,
      chunksCreated: 0,
      errors: ["Failed to save chunks: DB error"],
    });
  });
});

describe("indexFile", () => {
  let mockService: DatabaseService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockService = {
      initialize: vi.fn().mockResolvedValue(undefined),
      saveItem: vi.fn().mockResolvedValue("id1"),
      saveItems: vi.fn().mockResolvedValue(["id1"]),
      searchItems: vi.fn().mockResolvedValue([]),
      countItems: vi.fn().mockResolvedValue(0),
      listItems: vi.fn().mockResolvedValue([]),
      getStats: vi.fn().mockResolvedValue({ totalItems: 0, bySourceType: {} }),
      close: vi.fn().mockResolvedValue(undefined),
      getAdapterInfo: vi.fn().mockResolvedValue(null),
    } as const satisfies DatabaseService;
  });

  test("reads file and indexes content", async () => {
    const fileContent = "file content";
    vi.mocked(readFile).mockResolvedValue(fileContent);
    vi.mocked(chunkTextWithCST).mockResolvedValue(["chunk1"]);
    vi.mocked(generateEmbeddingsBatch).mockResolvedValue([[0.1, 0.2]]);

    const result = await indexFile(
      "/test/file.txt",
      { title: "Test File" },
      {},
      mockService,
    );

    expect(readFile).toHaveBeenCalledWith("/test/file.txt", "utf-8");
    expect(result).toEqual({
      itemsIndexed: 1,
      chunksCreated: 1,
      errors: [],
    });
  });

  test("handles file read errors", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("File not found"));

    const result = await indexFile("/test/file.txt", {}, {}, mockService);

    expect(result).toEqual({
      itemsIndexed: 0,
      chunksCreated: 0,
      errors: ["Failed to read file /test/file.txt: File not found"],
    });
  });
});

describe("indexFiles", () => {
  let mockService: DatabaseService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockService = {
      initialize: vi.fn().mockResolvedValue(undefined),
      saveItem: vi.fn().mockResolvedValue("id1"),
      saveItems: vi.fn().mockResolvedValue(["id1"]),
      searchItems: vi.fn().mockResolvedValue([]),
      countItems: vi.fn().mockResolvedValue(0),
      listItems: vi.fn().mockResolvedValue([]),
      getStats: vi.fn().mockResolvedValue({ totalItems: 0, bySourceType: {} }),
      close: vi.fn().mockResolvedValue(undefined),
      getAdapterInfo: vi.fn().mockResolvedValue(null),
    } as const satisfies DatabaseService;
  });

  test("indexes multiple files with glob patterns", async () => {
    // Mock glob to return an async iterator
    const mockFiles = ["/test/file1.md", "/test/file2.md"];
    vi.mocked(glob).mockImplementation(async function* () {
      for (const file of mockFiles) {
        yield file;
      }
    } as unknown);

    vi.mocked(validateFilePath).mockImplementation((path) =>
      Promise.resolve(path),
    );
    vi.mocked(readFile).mockResolvedValue("file content");
    vi.mocked(chunkTextWithCST).mockResolvedValue(["chunk1"]);
    vi.mocked(generateEmbeddingsBatch).mockResolvedValue([[0.1, 0.2]]);

    const result = await indexFiles(
      ["*.md"],
      { title: "Test Files" },
      {},
      mockService,
    );

    expect(glob).toHaveBeenCalledWith("*.md", {
      exclude: expect.any(Function),
    });
    expect(validateFilePath).toHaveBeenCalledTimes(2);
    expect(readFile).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      itemsIndexed: 2,
      chunksCreated: 2,
      errors: [],
    });
  });

  test("handles multiple glob patterns", async () => {
    // Mock different files for different patterns
    const pattern1Files = ["/test/file1.md"];
    const pattern2Files = ["/test/file2.txt"];

    vi.mocked(glob).mockImplementation(async function* (
      pattern: string | readonly string[],
    ) {
      if (pattern === "*.md") {
        for (const file of pattern1Files) {
          yield file;
        }
      } else if (pattern === "*.txt") {
        for (const file of pattern2Files) {
          yield file;
        }
      }
    } as unknown);

    vi.mocked(validateFilePath).mockImplementation((path) =>
      Promise.resolve(path),
    );
    vi.mocked(readFile).mockResolvedValue("file content");
    vi.mocked(chunkTextWithCST).mockResolvedValue(["chunk1"]);
    vi.mocked(generateEmbeddingsBatch).mockResolvedValue([[0.1, 0.2]]);

    const result = await indexFiles(
      ["*.md", "*.txt"],
      { title: "Mixed Files" },
      {},
      mockService,
    );

    expect(glob).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      itemsIndexed: 2,
      chunksCreated: 2,
      errors: [],
    });
  });

  test("handles security errors for individual files", async () => {
    const mockFiles = ["/test/file1.md", "/test/file2.md"];
    vi.mocked(glob).mockImplementation(async function* () {
      for (const file of mockFiles) {
        yield file;
      }
    } as unknown);

    vi.mocked(validateFilePath)
      .mockResolvedValueOnce("/test/file1.md")
      .mockRejectedValueOnce(
        new SecurityError("Access denied", "ACCESS_DENIED"),
      );

    vi.mocked(readFile).mockResolvedValue("file content");
    vi.mocked(chunkTextWithCST).mockResolvedValue(["chunk1"]);
    vi.mocked(generateEmbeddingsBatch).mockResolvedValue([[0.1, 0.2]]);

    const result = await indexFiles(["*.md"], {}, {}, mockService);

    expect(result.itemsIndexed).toBe(1);
    expect(result.errors).toContain(
      "Security error for /test/file2.md: Access denied",
    );
  });

  test("handles no matching files", async () => {
    vi.mocked(glob).mockImplementation(async function* () {
      // Return empty iterator
    } as unknown);

    const result = await indexFiles(["*.nonexistent"], {}, {}, mockService);

    expect(result).toEqual({
      itemsIndexed: 0,
      chunksCreated: 0,
      errors: ["No files matched the specified patterns"],
    });
  });

  test("handles glob pattern errors", async () => {
    // biome-ignore lint/correctness/useYield: Mock that immediately throws error
    vi.mocked(glob).mockImplementation(async function* () {
      throw new Error("Invalid pattern");
    });

    const result = await indexFiles(["[invalid"], {}, {}, mockService);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("Failed to process pattern [invalid");
    expect(result.errors[0]).toContain("Invalid pattern");
  });

  test("reports progress correctly", async () => {
    const mockFiles = ["/test/file1.md", "/test/file2.md"];
    vi.mocked(glob).mockImplementation(async function* () {
      for (const file of mockFiles) {
        yield file;
      }
    } as unknown);

    vi.mocked(validateFilePath).mockImplementation((path) =>
      Promise.resolve(path),
    );
    vi.mocked(readFile).mockResolvedValue("file content");
    vi.mocked(chunkTextWithCST).mockResolvedValue(["chunk1"]);
    vi.mocked(generateEmbeddingsBatch).mockResolvedValue([[0.1, 0.2]]);

    const progressCalls: string[] = [];
    const onProgress = vi.fn((message: string) => {
      progressCalls.push(message);
    });

    await indexFiles(["*.md"], {}, { onProgress }, mockService);

    expect(progressCalls).toContain("Found 2 files to index");
    expect(progressCalls).toContain("All files indexed");
    expect(onProgress).toHaveBeenCalledWith(
      expect.stringContaining("Indexing file 1/2"),
      expect.any(Number),
    );
    expect(onProgress).toHaveBeenCalledWith(
      expect.stringContaining("Indexing file 2/2"),
      expect.any(Number),
    );
  });
});

describe("indexGist", () => {
  let mockService: DatabaseService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockService = {
      initialize: vi.fn().mockResolvedValue(undefined),
      saveItem: vi.fn().mockResolvedValue("id1"),
      saveItems: vi.fn().mockResolvedValue(["id1"]),
      searchItems: vi.fn().mockResolvedValue([]),
      countItems: vi.fn().mockResolvedValue(0),
      listItems: vi.fn().mockResolvedValue([]),
      getStats: vi.fn().mockResolvedValue({ totalItems: 0, bySourceType: {} }),
      close: vi.fn().mockResolvedValue(undefined),
      getAdapterInfo: vi.fn().mockResolvedValue(null),
    } as const satisfies DatabaseService;

    vi.stubGlobal("fetch", vi.fn());
  });

  test("indexes gist content", async () => {
    const gistData = {
      description: "Test Gist",
      html_url: "https://gist.github.com/user/123",
      files: {
        "file1.txt": { content: "content1", filename: "file1.txt" },
      },
    };

    vi.mocked(validateGistUrl).mockReturnValue("123");
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => gistData,
    } as Response);
    vi.mocked(chunkTextWithCST).mockResolvedValue(["chunk1"]);
    vi.mocked(generateEmbeddingsBatch).mockResolvedValue([[0.1, 0.2]]);

    const result = await indexGist(
      "https://gist.github.com/user/123",
      {},
      mockService,
    );

    expect(validateGistUrl).toHaveBeenCalledWith(
      "https://gist.github.com/user/123",
    );
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "https://api.github.com/gists/123",
    );
    expect(result).toEqual({
      itemsIndexed: 1,
      chunksCreated: 1,
      errors: [],
    });
  });

  test("handles invalid gist URL", async () => {
    vi.mocked(validateGistUrl).mockImplementation(() => {
      throw new SecurityError("URL must be a GitHub Gist URL", "NOT_GIST_URL");
    });

    const result = await indexGist("invalid-url", {}, mockService);

    expect(result.itemsIndexed).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("Security error");
  });
});

describe("indexGitHubRepo", () => {
  let mockService: DatabaseService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockService = {
      initialize: vi.fn().mockResolvedValue(undefined),
      saveItem: vi.fn().mockResolvedValue("id1"),
      saveItems: vi.fn().mockResolvedValue(["id1"]),
      searchItems: vi.fn().mockResolvedValue([]),
      countItems: vi.fn().mockResolvedValue(0),
      listItems: vi.fn().mockResolvedValue([]),
      getStats: vi.fn().mockResolvedValue({ totalItems: 0, bySourceType: {} }),
      close: vi.fn().mockResolvedValue(undefined),
      getAdapterInfo: vi.fn().mockResolvedValue(null),
    } as const satisfies DatabaseService;

    vi.stubGlobal("fetch", vi.fn());
  });

  test("indexes GitHub repository content", async () => {
    const repoContents = [
      {
        name: "file.md",
        path: "file.md",
        type: "file",
        download_url:
          "https://raw.githubusercontent.com/user/repo/main/file.md",
        html_url: "https://github.com/user/repo/blob/main/file.md",
      },
    ];

    vi.mocked(validateGitHubRepoUrl).mockReturnValue({
      owner: "user",
      repo: "repo",
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => repoContents,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => "file content",
      } as Response);
    vi.mocked(chunkTextWithCST).mockResolvedValue(["chunk1"]);
    vi.mocked(generateEmbeddingsBatch).mockResolvedValue([[0.1, 0.2]]);

    const result = await indexGitHubRepo(
      "https://github.com/user/repo",
      { branch: "main" },
      mockService,
    );

    expect(validateGitHubRepoUrl).toHaveBeenCalledWith(
      "https://github.com/user/repo",
    );
    expect(result).toEqual({
      itemsIndexed: 1,
      chunksCreated: 1,
      errors: [],
    });
  });

  test("handles invalid GitHub URL", async () => {
    vi.mocked(validateGitHubRepoUrl).mockReturnValue({
      owner: "",
      repo: "",
    });

    const result = await indexGitHubRepo("invalid-url", {}, mockService);

    expect(result).toEqual({
      itemsIndexed: 0,
      chunksCreated: 0,
      errors: ["Invalid GitHub repository URL: invalid-url"],
    });
  });
});

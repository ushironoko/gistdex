import { randomUUID } from "node:crypto";
import { glob, readFile } from "node:fs/promises";
import { getOptimalChunkSettings } from "./chunk-optimizer.js";
import { chunkTextWithCST } from "./chunking.js";
import type { DatabaseService, ItemMetadata } from "./database-service.js";
import { generateEmbeddingsBatch } from "./embedding.js";
import {
  SecurityError,
  validateFilePath,
  validateGistUrl,
  validateGitHubRepoUrl,
} from "./security.js";

export interface IndexOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  batchSize?: number;
  autoChunkOptimize?: boolean;
  preserveBoundaries?: boolean;
  onProgress?: (message: string, progress?: number) => void;
}

export interface IndexResult {
  itemsIndexed: number;
  chunksCreated: number;
  errors: string[];
}

export async function indexText(
  text: string,
  metadata: ItemMetadata = {},
  options: IndexOptions = {},
  service?: DatabaseService,
): Promise<IndexResult> {
  const {
    chunkSize = 1000,
    chunkOverlap = 200,
    batchSize = 100,
    onProgress,
  } = options;

  const result: IndexResult = {
    itemsIndexed: 0,
    chunksCreated: 0,
    errors: [],
  };

  try {
    if (onProgress) {
      onProgress("Chunking text...");
    }

    const chunks = await chunkTextWithCST(text, {
      size: chunkSize,
      overlap: chunkOverlap,
      preserveBoundaries: options.preserveBoundaries,
      filePath: metadata.filePath as string | undefined,
    });

    if (chunks.length === 0) {
      result.errors.push("No chunks generated from text");
      return result;
    }

    if (onProgress) {
      onProgress(`Generating embeddings for ${chunks.length} chunks...`);
    }

    const embeddings = await generateEmbeddingsBatch(chunks, {
      batchSize,
      onProgress: (processed, total) => {
        if (onProgress) {
          onProgress(
            `Generating embeddings: ${processed}/${total}`,
            processed / total,
          );
        }
      },
    });

    if (onProgress) {
      onProgress("Saving to database...");
    }

    // Generate a unique source ID for this content
    const sourceId = randomUUID();

    const items = chunks.map((chunk, i) => ({
      content: chunk,
      embedding: embeddings[i] ?? [],
      metadata: {
        ...metadata,
        sourceId,
        chunkIndex: i,
        totalChunks: chunks.length,
        // Store original content only in the first chunk to save space
        ...(i === 0 ? { originalContent: text } : {}),
      },
    }));

    try {
      if (!service) {
        throw new Error("Database service is required");
      }
      const dbService = service;
      const ids = await dbService.saveItems(items);
      result.itemsIndexed = ids.length;
      result.chunksCreated = chunks.length;
    } catch (error) {
      result.errors.push(
        `Failed to save chunks: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (onProgress) {
      onProgress("Indexing complete", 1);
    }
  } catch (error) {
    result.errors.push(
      `Indexing failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return result;
}

export async function indexFile(
  filePath: string,
  metadata: ItemMetadata = {},
  options: IndexOptions = {},
  service?: DatabaseService,
): Promise<IndexResult> {
  try {
    const content = await readFile(filePath, "utf-8");

    const fileMetadata: ItemMetadata = {
      ...metadata,
      sourceType: "file",
      filePath,
    };

    // Apply optimal chunk settings if auto-optimize is enabled
    let finalOptions = options;
    if (
      options.autoChunkOptimize &&
      !options.chunkSize &&
      !options.chunkOverlap
    ) {
      const optimalSettings = getOptimalChunkSettings(filePath);
      finalOptions = {
        ...options,
        chunkSize: optimalSettings.chunkSize,
        chunkOverlap: optimalSettings.chunkOverlap,
      };
    }

    // Enable boundary preservation for code and markdown files by default if autoChunkOptimize is enabled
    if (options.autoChunkOptimize && options.preserveBoundaries === undefined) {
      const ext = filePath.toLowerCase();
      if (
        ext.endsWith(".md") ||
        ext.endsWith(".mdx") ||
        ext.endsWith(".js") ||
        ext.endsWith(".ts") ||
        ext.endsWith(".jsx") ||
        ext.endsWith(".tsx") ||
        ext.endsWith(".py") ||
        ext.endsWith(".java") ||
        ext.endsWith(".rs") ||
        ext.endsWith(".go")
      ) {
        finalOptions = {
          ...finalOptions,
          preserveBoundaries: true,
        };
      }
    }

    return indexText(content, fileMetadata, finalOptions, service);
  } catch (error) {
    return {
      itemsIndexed: 0,
      chunksCreated: 0,
      errors: [
        `Failed to read file ${filePath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ],
    };
  }
}

export async function indexFiles(
  patterns: string[],
  metadata: ItemMetadata = {},
  options: IndexOptions = {},
  service?: DatabaseService,
): Promise<IndexResult> {
  const result: IndexResult = {
    itemsIndexed: 0,
    chunksCreated: 0,
    errors: [],
  };

  const { onProgress } = options;

  try {
    // Collect all matching files
    const allFiles = new Set<string>();

    for (const pattern of patterns) {
      try {
        // Use glob to find matching files
        for await (const match of glob(pattern, {
          exclude: (path: string) => path.includes("node_modules"),
        })) {
          // Validate each file path for security
          try {
            const validatedPath = await validateFilePath(match);
            allFiles.add(validatedPath);
          } catch (error) {
            if (error instanceof SecurityError) {
              result.errors.push(
                `Security error for ${match}: ${error.message}`,
              );
            }
          }
        }
      } catch (error) {
        result.errors.push(
          `Failed to process pattern ${pattern}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const fileArray = Array.from(allFiles);

    if (fileArray.length === 0) {
      result.errors.push("No files matched the specified patterns");
      return result;
    }

    if (onProgress) {
      onProgress(`Found ${fileArray.length} files to index`);
    }

    // Process each file
    for (let i = 0; i < fileArray.length; i++) {
      const filePath = fileArray[i];
      if (!filePath) continue;

      if (onProgress) {
        onProgress(
          `Indexing file ${i + 1}/${fileArray.length}: ${filePath}`,
          (i + 1) / fileArray.length,
        );
      }

      const fileResult = await indexFile(
        filePath,
        {
          ...metadata,
          title: metadata.title || filePath,
        },
        options,
        service,
      );

      result.itemsIndexed += fileResult.itemsIndexed;
      result.chunksCreated += fileResult.chunksCreated;
      result.errors.push(...fileResult.errors);
    }

    if (onProgress) {
      onProgress("All files indexed", 1);
    }
  } catch (error) {
    result.errors.push(
      `Failed to index files: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return result;
}

export async function indexGist(
  gistUrl: string,
  options: IndexOptions = {},
  service?: DatabaseService,
): Promise<IndexResult> {
  const result: IndexResult = {
    itemsIndexed: 0,
    chunksCreated: 0,
    errors: [],
  };

  try {
    // Validate the Gist URL using security module
    const gistId = validateGistUrl(gistUrl);

    if (!gistId) {
      result.errors.push(`Invalid Gist URL: ${gistUrl}`);
      return result;
    }

    const apiUrl = `https://api.github.com/gists/${gistId}`;
    const response = await fetch(apiUrl);

    if (!response.ok) {
      result.errors.push(
        `Failed to fetch Gist: ${response.status} ${response.statusText}`,
      );
      return result;
    }

    const gistData = (await response.json()) as {
      description?: string;
      files: Record<string, { content: string; filename: string }>;
      html_url: string;
    };

    const files = Object.values(gistData.files);

    for (const file of files) {
      const metadata: ItemMetadata = {
        title: file.filename,
        url: gistUrl,
        sourceType: "gist",
        gistId,
        description: gistData.description,
      };

      const fileResult = await indexText(
        file.content,
        metadata,
        options,
        service,
      );

      result.itemsIndexed += fileResult.itemsIndexed;
      result.chunksCreated += fileResult.chunksCreated;
      result.errors.push(...fileResult.errors);
    }
  } catch (error) {
    if (error instanceof SecurityError) {
      result.errors.push(`Security error: ${error.message}`);
    } else {
      result.errors.push(
        `Failed to index Gist: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return result;
}

export async function indexGitHubRepo(
  repoUrl: string,
  options: IndexOptions & { branch?: string; paths?: string[] } = {},
  service?: DatabaseService,
): Promise<IndexResult> {
  const result: IndexResult = {
    itemsIndexed: 0,
    chunksCreated: 0,
    errors: [],
  };

  try {
    // Validate the GitHub repository URL using security module
    const { owner, repo } = validateGitHubRepoUrl(repoUrl);

    if (!owner || !repo) {
      result.errors.push(`Invalid GitHub repository URL: ${repoUrl}`);
      return result;
    }

    const branch = options.branch || "main";
    const paths = options.paths || [""];

    for (const path of paths) {
      const contentsUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;

      const filesResult = await indexGitHubPath(
        contentsUrl,
        { owner, repo, branch },
        options,
        service,
      );

      result.itemsIndexed += filesResult.itemsIndexed;
      result.chunksCreated += filesResult.chunksCreated;
      result.errors.push(...filesResult.errors);
    }
  } catch (error) {
    if (error instanceof SecurityError) {
      result.errors.push(`Security error: ${error.message}`);
    } else {
      result.errors.push(
        `Failed to index GitHub repo: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return result;
}

async function indexGitHubPath(
  contentsUrl: string,
  repoInfo: { owner: string; repo: string; branch: string },
  options: IndexOptions,
  service?: DatabaseService,
): Promise<IndexResult> {
  const result: IndexResult = {
    itemsIndexed: 0,
    chunksCreated: 0,
    errors: [],
  };

  try {
    const response = await fetch(contentsUrl);

    if (!response.ok) {
      result.errors.push(
        `Failed to fetch contents: ${response.status} ${response.statusText}`,
      );
      return result;
    }

    const contents = (await response.json()) as Array<{
      name: string;
      path: string;
      type: "file" | "dir";
      download_url?: string;
      html_url: string;
    }>;

    for (const item of contents) {
      if (item.type === "file" && item.download_url) {
        if (isTextFile(item.name)) {
          try {
            const fileResponse = await fetch(item.download_url);
            const content = await fileResponse.text();

            const metadata: ItemMetadata = {
              title: item.name,
              url: item.html_url,
              sourceType: "github",
              owner: repoInfo.owner,
              repo: repoInfo.repo,
              branch: repoInfo.branch,
              path: item.path,
            };

            const fileResult = await indexText(
              content,
              metadata,
              options,
              service,
            );

            result.itemsIndexed += fileResult.itemsIndexed;
            result.chunksCreated += fileResult.chunksCreated;
            result.errors.push(...fileResult.errors);
          } catch (error) {
            result.errors.push(
              `Failed to index file ${item.path}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }
      }
    }
  } catch (error) {
    result.errors.push(
      `Failed to process GitHub path: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return result;
}

function isTextFile(filename: string): boolean {
  const textExtensions = [
    // Documentation
    ".txt",
    ".md",
    ".mdx",

    // JavaScript/TypeScript ecosystem
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".mjs",
    ".mts",
    ".cjs",

    // Major programming languages
    ".py", // Python
    ".go", // Go
    ".rs", // Rust
    ".java", // Java
    ".rb", // Ruby
    ".c", // C
    ".cpp", // C++
    ".h", // C/C++ headers

    // Web technologies
    ".html",
    ".css",
    ".sass",
    ".scss",
    ".json",
    ".xml",
    ".xmlx",

    // Configuration files
    ".yaml",
    ".yml",
    ".toml",

    // Shell scripts
    ".sh",
    ".bash",

    // Frontend frameworks
    ".vue",
    ".svelte",

    // examples
    ".example",
  ] as const;

  const lowerFilename = filename.toLowerCase();
  return textExtensions.some((ext) => lowerFilename.endsWith(ext));
}

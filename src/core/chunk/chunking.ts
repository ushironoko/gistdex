import path from "node:path";
import {
  chunkCodeByBoundary,
  chunkMarkdownByBoundary,
} from "./boundary-aware-chunking.js";
import { createCSTChunkingOperations } from "./cst-operations.js";
import {
  getLanguageFromExtension,
  isCodeFile,
  isMarkdownFile,
  isTreeSitterSupported,
} from "./file-extensions.js";
import { calculateLineNumbers } from "./line-utils.js";

export interface ChunkOptions {
  size?: number;
  overlap?: number;
  preserveWords?: boolean;
  preserveBoundaries?: boolean;
  filePath?: string;
}

export interface ChunkWithMetadata {
  content: string;
  index: number;
  start: number;
  end: number;
  boundary?: {
    type: string;
    level?: number;
    name?: string;
    title?: string;
    startLine?: number;
    endLine?: number;
  };
}

/**
 * Core chunking logic shared by both chunkText and chunkTextWithMetadata
 * This eliminates code duplication and ensures consistent behavior
 */
function createChunks(
  text: string,
  options: ChunkOptions = {},
): ChunkWithMetadata[] {
  const { size = 1000, overlap = 100, preserveWords = true } = options;

  // Validation
  if (size <= 0) {
    throw new Error("Chunk size must be greater than 0");
  }

  if (overlap < 0) {
    throw new Error("Overlap cannot be negative");
  }

  if (overlap >= size) {
    throw new Error("Overlap must be less than chunk size");
  }

  // Handle small text
  if (text.length <= size) {
    return [
      {
        content: text,
        index: 0,
        start: 0,
        end: text.length,
      },
    ];
  }

  const chunks: ChunkWithMetadata[] = [];
  const step = size - overlap;
  let chunkIndex = 0;

  for (let i = 0; i < text.length; i += step) {
    let end = Math.min(i + size, text.length);

    // Preserve word boundaries if requested
    if (preserveWords && end < text.length) {
      const lastSpace = text.lastIndexOf(" ", end);
      const lastNewline = text.lastIndexOf("\n", end);
      const breakPoint = Math.max(lastSpace, lastNewline);

      if (breakPoint > i) {
        end = breakPoint;
      }
    }

    const content = text.slice(i, end).trim();

    if (content.length > 0) {
      chunks.push({
        content,
        index: chunkIndex++,
        start: i,
        end,
      });
    }

    if (end >= text.length) {
      break;
    }
  }

  return chunks;
}

/**
 * Handles boundary-aware chunking for markdown files
 */
function handleMarkdownBoundaryChunking(
  text: string,
  options: ChunkOptions,
): ChunkWithMetadata[] {
  const boundaryChunks = chunkMarkdownByBoundary(text, {
    maxChunkSize: options.size || 1000,
    overlap: options.overlap || 100,
  });
  return boundaryChunks.map((chunk, index) => {
    const { startLine, endLine } = calculateLineNumbers(
      text,
      chunk.startOffset,
      chunk.endOffset,
    );
    return {
      content: chunk.content,
      index,
      start: chunk.startOffset,
      end: chunk.endOffset,
      boundary: {
        ...chunk.boundary,
        startLine,
        endLine,
      },
    };
  });
}

/**
 * Handles boundary-aware chunking for code files
 */
function handleCodeBoundaryChunking(
  text: string,
  language: string,
  options: ChunkOptions,
): ChunkWithMetadata[] {
  const boundaryChunks = chunkCodeByBoundary(text, language, {
    maxChunkSize: options.size || 1000,
    overlap: options.overlap || 100,
  });
  return boundaryChunks.map((chunk, index) => {
    const { startLine, endLine } = calculateLineNumbers(
      text,
      chunk.startOffset,
      chunk.endOffset,
    );
    return {
      content: chunk.content,
      index,
      start: chunk.startOffset,
      end: chunk.endOffset,
      boundary: {
        ...chunk.boundary,
        startLine,
        endLine,
      },
    };
  });
}

/**
 * Internal function to handle boundary-aware chunking
 */
function performBoundaryAwareChunking(
  text: string,
  options: ChunkOptions,
): ChunkWithMetadata[] | null {
  if (!options.preserveBoundaries || !options.filePath) {
    return null;
  }

  const ext = path.extname(options.filePath).toLowerCase();

  // Handle Markdown files
  if (isMarkdownFile(ext)) {
    return handleMarkdownBoundaryChunking(text, options);
  }

  // Handle code files
  if (isCodeFile(ext)) {
    const language = getLanguageFromExtension(ext) || "javascript";
    return handleCodeBoundaryChunking(text, language, options);
  }

  return null;
}

// CST-aware chunking with async support
export async function chunkTextWithCST(
  text: string,
  options: ChunkOptions = {},
): Promise<string[]> {
  // Try CST-based chunking for supported file types
  if (options.preserveBoundaries && options.filePath) {
    const ext = path.extname(options.filePath).toLowerCase();

    // Handle Markdown files (synchronous)
    if (isMarkdownFile(ext)) {
      const chunks = handleMarkdownBoundaryChunking(text, options);
      return chunks.map((chunk) => chunk.content);
    }

    // Check if tree-sitter is supported for this file type
    if (isTreeSitterSupported(ext)) {
      const cstOperations = createCSTChunkingOperations();
      const boundaryChunks = await cstOperations.chunkWithFallback(
        text,
        options.filePath,
        {
          maxChunkSize: options.size || 1000,
          overlap: options.overlap || 100,
        },
        chunkCodeByBoundary,
      );
      return boundaryChunks.map((chunk) => chunk.content);
    }
  }

  // Fallback to simple chunking
  return createChunks(text, options).map((chunk) => chunk.content);
}

// CST-aware chunking with metadata (includes boundary information)
export async function chunkTextWithCSTAndMetadata(
  text: string,
  options: ChunkOptions = {},
): Promise<ChunkWithMetadata[]> {
  // Try CST-based chunking for supported file types
  if (options.preserveBoundaries && options.filePath) {
    const ext = path.extname(options.filePath).toLowerCase();

    // Handle Markdown files (synchronous)
    if (isMarkdownFile(ext)) {
      return handleMarkdownBoundaryChunking(text, options);
    }

    // Check if tree-sitter is supported for this file type
    if (isTreeSitterSupported(ext)) {
      const cstOperations = createCSTChunkingOperations();
      const boundaryChunks = await cstOperations.chunkWithFallback(
        text,
        options.filePath,
        {
          maxChunkSize: options.size || 1000,
          overlap: options.overlap || 100,
        },
        chunkCodeByBoundary,
      );
      return boundaryChunks.map((chunk, index) => ({
        content: chunk.content,
        index,
        start: chunk.startOffset,
        end: chunk.endOffset,
        boundary: chunk.boundary,
      }));
    }
  }

  // Fallback to simple chunking
  return createChunks(text, options);
}

// Backward compatible synchronous version
export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const boundaryChunks = performBoundaryAwareChunking(text, options);
  if (boundaryChunks) {
    return boundaryChunks.map((chunk) => chunk.content);
  }
  return createChunks(text, options).map((chunk) => chunk.content);
}

import path from "node:path";
import type { SyntaxNode } from "web-tree-sitter";
import type {
  BoundaryChunk,
  BoundaryChunkOptions,
} from "./boundary-aware-chunking.js";
import { getLanguageFromExtension } from "./file-extensions.js";
import {
  createBoundaryNodeTypes,
  createNodeNameExtractor,
  isModifierNode,
} from "./language-node-types.js";
import type { ParserFactory } from "./parser-factory.js";
import { createParserFactory } from "./parser-factory.js";

interface CSTBoundary {
  type: string;
  name?: string;
  startIndex: number;
  endIndex: number;
  text: string;
}

// Node traversal operations
const createNodeTraverser = (language: string) => {
  const boundaryNodeTypes = createBoundaryNodeTypes(language);
  const extractName = createNodeNameExtractor(language);

  const isBoundary = (nodeType: string): boolean =>
    boundaryNodeTypes.has(nodeType);

  const traverse = (node: SyntaxNode): CSTBoundary[] => {
    const boundaries: CSTBoundary[] = [];

    const visit = (node: SyntaxNode, insideBoundary = false): void => {
      const isCurrentBoundary = isBoundary(node.type);

      if (isCurrentBoundary && !insideBoundary) {
        // Check if parent is a language-specific modifier node to include modifiers
        const { textToUse, startIndex, endIndex } = (() => {
          const parent = node.parent;
          if (parent && isModifierNode(parent.type, language)) {
            return {
              textToUse: parent.text,
              startIndex: parent.startIndex,
              endIndex: parent.endIndex,
            };
          }
          return {
            textToUse: node.text,
            startIndex: node.startIndex,
            endIndex: node.endIndex,
          };
        })();

        boundaries.push({
          // Keep the actual boundary type and name from the current node
          // (e.g., "function_declaration", "foo") for proper identification,
          // even when including parent modifier text (e.g., "export")
          type: node.type,
          name: extractName(node),
          startIndex: startIndex,
          endIndex: endIndex,
          text: textToUse,
        });
        // Child nodes inside boundary nodes are not treated as boundaries
        for (const child of node.children) {
          visit(child, true);
        }
      } else {
        // If not a boundary node, traverse child nodes with the same boundary state
        for (const child of node.children) {
          visit(child, insideBoundary);
        }
      }
    };

    visit(node);
    return boundaries;
  };

  return { traverse };
};

// CST parsing operations
const createCSTOperations = (factory: ParserFactory) => {
  const parseAndExtractBoundaries = async (
    code: string,
    language: string,
  ): Promise<CSTBoundary[]> => {
    const parser = await factory.createParser(language);
    if (!parser) {
      throw new Error(`No parser available for language: ${language}`);
    }

    const traverser = createNodeTraverser(language);
    const tree = parser.parse(code);
    if (!tree) {
      throw new Error(`Failed to parse code for language: ${language}`);
    }
    return traverser.traverse(tree.rootNode);
  };

  const boundariesToChunks = (boundaries: CSTBoundary[]): BoundaryChunk[] => {
    return boundaries.map((boundary) => ({
      content: boundary.text,
      startOffset: boundary.startIndex,
      endOffset: boundary.endIndex,
      boundary: {
        type: boundary.type,
        name: boundary.name,
      },
    }));
  };

  return { parseAndExtractBoundaries, boundariesToChunks };
};

// Function composition with 'with' pattern
export const withCSTParsing = async <T>(
  factory: ParserFactory,
  operation: (ops: ReturnType<typeof createCSTOperations>) => Promise<T>,
): Promise<T> => {
  const ops = createCSTOperations(factory);
  try {
    return await operation(ops);
  } finally {
    // Resource cleanup is managed at the factory level
  }
};

// Export CST operations (for testing)
export { createCSTOperations };

// High-level chunking operations
export const createCSTChunkingOperations = () => {
  let reportedFailure = false;

  const chunkWithCST = async (
    code: string,
    language: string,
    _options: BoundaryChunkOptions,
    factory: ParserFactory,
  ): Promise<BoundaryChunk[]> => {
    return withCSTParsing(factory, async (ops) => {
      const boundaries = await ops.parseAndExtractBoundaries(code, language);
      return ops.boundariesToChunks(boundaries);
    });
  };

  const chunkWithFallback = async (
    code: string,
    filePath: string,
    options: BoundaryChunkOptions,
    fallback: (
      code: string,
      lang: string,
      opts: BoundaryChunkOptions,
    ) => BoundaryChunk[],
  ): Promise<BoundaryChunk[]> => {
    const ext = path.extname(filePath);
    const language = getLanguageFromExtension(ext);

    if (!language) {
      return fallback(code, "unknown", options);
    }

    const factory = createParserFactory();

    try {
      const result = await chunkWithCST(code, language, options, factory);
      // CST parsing succeeded
      return result;
    } catch (error) {
      // If CST parsing failed, notify the user once
      if (!reportedFailure) {
        if (process.env.DEBUG_GISTDEX) {
          console.debug("\n⚠️  CST-based code parsing failed");
          console.debug("Falling back to basic text chunking");
          console.debug(`Failed file: ${filePath}`);
        }
        reportedFailure = true;
      }

      if (process.env.DEBUG_GISTDEX) {
        console.debug(`CST parsing failed for ${filePath}:`, error);
      }

      return fallback(code, language, options);
    } finally {
      factory.dispose();
    }
  };

  return { chunkWithCST, chunkWithFallback };
};

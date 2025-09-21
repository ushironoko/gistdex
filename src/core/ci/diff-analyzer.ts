import { extname } from "node:path";
import type { SyntaxNode } from "web-tree-sitter";
import { getLanguageFromExtension } from "../chunk/file-extensions.js";
import {
  createNodeNameExtractor,
  LANGUAGE_NODE_TYPES,
} from "../chunk/language-node-types.js";
import { createParserFactory } from "../chunk/parser-factory.js";
import { executeGitCommand } from "./git-command.js";

export interface DiffChange {
  type: "added" | "modified" | "deleted";
  file: string;
  content: string;
  symbols: string[];
}

export interface DiffAnalysis {
  changes: DiffChange[];
  searchQueries: string[];
}

/**
 * Analyze git diff for the specified range
 */
export const analyzeDiff = async (diffRange: string): Promise<DiffAnalysis> => {
  try {
    // Get list of changed files
    const changedFiles = executeGitCommand(["diff", "--name-status", diffRange])
      .trim()
      .split("\n")
      .filter(Boolean);

    const changes: DiffChange[] = [];

    for (const line of changedFiles) {
      const [status, ...fileParts] = line.split("\t");
      const file = fileParts.join("\t");

      if (!status || !file) continue;

      let type: DiffChange["type"];
      if (status.startsWith("A")) {
        type = "added";
      } else if (status.startsWith("D")) {
        type = "deleted";
      } else {
        type = "modified";
      }

      // Get the diff content for this file
      let content = "";
      try {
        if (type === "deleted") {
          // For deleted files, get the content from the base
          const baseRef = diffRange.split("..")[0];
          if (baseRef) {
            content = executeGitCommand(["show", `${baseRef}:${file}`]);
          }
        } else {
          // For added/modified files, get the current content and diff
          const diff = executeGitCommand(["diff", diffRange, "--", file]);
          content = extractRelevantContent(diff);
        }
      } catch {
        // If we can't get the content, continue with empty content
        content = "";
      }

      const symbols = await extractSymbols(content, file);

      changes.push({
        type,
        file,
        content: content.slice(0, 2000), // Limit content size
        symbols,
      });
    }

    const searchQueries = generateSearchQueries(changes);

    return { changes, searchQueries };
  } catch (error) {
    throw new Error(`Failed to analyze diff: ${error}`);
  }
};

/**
 * Extract relevant content from git diff output
 */
const extractRelevantContent = (diff: string): string => {
  const lines = diff.split("\n");
  const relevantLines: string[] = [];

  // Include context lines around changes for better understanding
  const contextLines = 3;
  const addedIndices = new Set<number>();
  const removedIndices = new Set<number>();

  // First pass: identify changed lines
  lines.forEach((line, index) => {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      addedIndices.add(index);
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      removedIndices.add(index);
    }
  });

  // Second pass: collect changed lines and their context
  const collectedIndices = new Set<number>();

  lines.forEach((line, index) => {
    if (addedIndices.has(index) || removedIndices.has(index)) {
      // Add the changed line
      if (!collectedIndices.has(index)) {
        const cleanLine = line.slice(1); // Remove +/- prefix
        relevantLines.push(cleanLine);
        collectedIndices.add(index);
      }

      // Add context lines around the change
      for (
        let i = Math.max(0, index - contextLines);
        i <= Math.min(lines.length - 1, index + contextLines);
        i++
      ) {
        if (!collectedIndices.has(i) && i < lines.length) {
          const contextLine = lines[i];
          // Skip diff headers and unchanged context
          if (
            contextLine &&
            !contextLine.startsWith("@@") &&
            !contextLine.startsWith("+++") &&
            !contextLine.startsWith("---") &&
            !contextLine.startsWith("diff ")
          ) {
            // Remove prefix if it exists (space for context, +/- for changes)
            const match = contextLine.match(/^[ +-](.*)$/);
            const cleanContextLine = match ? match[1] : contextLine;
            if (cleanContextLine && cleanContextLine.trim()) {
              relevantLines.push(cleanContextLine);
              collectedIndices.add(i);
            }
          }
        }
      }
    }
  });

  // If no changes found (might be a new file), try to extract the entire content
  if (relevantLines.length === 0) {
    for (const line of lines) {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        relevantLines.push(line.slice(1));
      }
    }
  }

  return relevantLines.join("\n");
};

/**
 * Extract symbols from CST nodes using tree-sitter
 */
const extractSymbolsFromCST = (
  node: SyntaxNode,
  language: string,
): string[] => {
  const symbols: string[] = [];

  // Get language configuration
  const langConfig =
    LANGUAGE_NODE_TYPES[language as keyof typeof LANGUAGE_NODE_TYPES];
  if (!langConfig) {
    return symbols; // Unknown language
  }

  // Collect all node types that represent symbols
  const nodeTypesToExtract = new Set<string>();

  // Add all symbol-representing node types
  const addNodeTypes = (key: string) => {
    const types = (langConfig as Record<string, unknown>)[key];
    if (Array.isArray(types)) {
      for (const type of types) {
        if (typeof type === "string") {
          nodeTypesToExtract.add(type);
        }
      }
    }
  };

  // Add functions, classes, methods, interfaces, types, etc.
  addNodeTypes("functions");
  addNodeTypes("classes");
  addNodeTypes("methods");
  addNodeTypes("interfaces");
  addNodeTypes("types");
  addNodeTypes("structs");
  addNodeTypes("traits");
  addNodeTypes("impls");
  addNodeTypes("modules");
  addNodeTypes("enums");

  // Create name extractor for this language
  const extractNodeName = createNodeNameExtractor(language);

  const traverse = (currentNode: SyntaxNode) => {
    // Check if this node type should be extracted
    if (nodeTypesToExtract.has(currentNode.type)) {
      const name = extractNodeName(currentNode);
      if (name) {
        symbols.push(name);
      }
    }

    // Recursively traverse children
    for (let i = 0; i < currentNode.childCount; i++) {
      const child = currentNode.child(i);
      if (child) {
        traverse(child);
      }
    }
  };

  traverse(node);
  return symbols;
};

/**
 * Fallback: Extract symbols using regex patterns
 */
const extractSymbolsWithRegex = (content: string, ext: string): string[] => {
  const symbols: string[] = [];

  // TypeScript/JavaScript
  if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts", ".cjs"].includes(ext)) {
    // Function declarations
    const funcRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
    let match: RegExpExecArray | null = funcRegex.exec(content);
    while (match !== null) {
      if (match[1]) symbols.push(match[1]);
      match = funcRegex.exec(content);
    }

    // Arrow functions assigned to const/let/var
    const arrowRegex =
      /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g;
    match = arrowRegex.exec(content);
    while (match !== null) {
      if (match[1]) symbols.push(match[1]);
      match = arrowRegex.exec(content);
    }

    // Classes
    const classRegex = /(?:export\s+)?class\s+(\w+)/g;
    match = classRegex.exec(content);
    while (match !== null) {
      if (match[1]) symbols.push(match[1]);
      match = classRegex.exec(content);
    }

    // Interfaces (TypeScript)
    if ([".ts", ".tsx"].includes(ext)) {
      const interfaceRegex = /(?:export\s+)?interface\s+(\w+)/g;
      match = interfaceRegex.exec(content);
      while (match !== null) {
        if (match[1]) symbols.push(match[1]);
        match = interfaceRegex.exec(content);
      }

      // Type aliases
      const typeRegex = /(?:export\s+)?type\s+(\w+)\s*=/g;
      match = typeRegex.exec(content);
      while (match !== null) {
        if (match[1]) symbols.push(match[1]);
        match = typeRegex.exec(content);
      }
    }
  }

  // Python
  if ([".py"].includes(ext)) {
    // Functions and methods
    const pyFuncRegex = /^\s*def\s+(\w+)\s*\(/gm;
    let pyMatch: RegExpExecArray | null = pyFuncRegex.exec(content);
    while (pyMatch !== null) {
      if (pyMatch[1]) symbols.push(pyMatch[1]);
      pyMatch = pyFuncRegex.exec(content);
    }

    // Classes
    const pyClassRegex = /^\s*class\s+(\w+)/gm;
    pyMatch = pyClassRegex.exec(content);
    while (pyMatch !== null) {
      if (pyMatch[1]) symbols.push(pyMatch[1]);
      pyMatch = pyClassRegex.exec(content);
    }
  }

  // Go
  if ([".go"].includes(ext)) {
    // Functions
    const goFuncRegex = /func\s+(?:\(\s*\w+\s+[^)]+\)\s+)?(\w+)\s*\(/g;
    let goMatch = goFuncRegex.exec(content);
    while (goMatch !== null) {
      if (goMatch[1]) symbols.push(goMatch[1]);
      goMatch = goFuncRegex.exec(content);
    }

    // Types and structs
    const goTypeRegex = /type\s+(\w+)\s+(?:struct|interface)/g;
    goMatch = goTypeRegex.exec(content);
    while (goMatch !== null) {
      if (goMatch[1]) symbols.push(goMatch[1]);
      goMatch = goTypeRegex.exec(content);
    }
  }

  // Rust
  if ([".rs"].includes(ext)) {
    // Functions
    const rustFuncRegex = /(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/g;
    let rustMatch = rustFuncRegex.exec(content);
    while (rustMatch !== null) {
      if (rustMatch[1]) symbols.push(rustMatch[1]);
      rustMatch = rustFuncRegex.exec(content);
    }

    // Structs and enums
    const rustTypeRegex = /(?:pub\s+)?(?:struct|enum|trait)\s+(\w+)/g;
    rustMatch = rustTypeRegex.exec(content);
    while (rustMatch !== null) {
      if (rustMatch[1]) symbols.push(rustMatch[1]);
      rustMatch = rustTypeRegex.exec(content);
    }
  }

  // Java
  if ([".java"].includes(ext)) {
    // Classes and interfaces
    const javaClassRegex =
      /(?:public\s+)?(?:abstract\s+)?(?:class|interface)\s+(\w+)/g;
    let javaMatch = javaClassRegex.exec(content);
    while (javaMatch !== null) {
      if (javaMatch[1]) symbols.push(javaMatch[1]);
      javaMatch = javaClassRegex.exec(content);
    }

    // Methods
    const javaMethodRegex =
      /(?:public|private|protected)\s+(?:static\s+)?\w+\s+(\w+)\s*\(/g;
    javaMatch = javaMethodRegex.exec(content);
    while (javaMatch !== null) {
      if (javaMatch[1]) symbols.push(javaMatch[1]);
      javaMatch = javaMethodRegex.exec(content);
    }
  }

  // Ruby
  if ([".rb"].includes(ext)) {
    // Methods
    const rubyMethodRegex = /def\s+(\w+)/g;
    let rubyMatch = rubyMethodRegex.exec(content);
    while (rubyMatch !== null) {
      if (rubyMatch[1]) symbols.push(rubyMatch[1]);
      rubyMatch = rubyMethodRegex.exec(content);
    }

    // Classes and modules
    const rubyClassRegex = /(?:class|module)\s+(\w+)/g;
    rubyMatch = rubyClassRegex.exec(content);
    while (rubyMatch !== null) {
      if (rubyMatch[1]) symbols.push(rubyMatch[1]);
      rubyMatch = rubyClassRegex.exec(content);
    }
  }

  // C/C++
  if ([".c", ".cpp", ".h", ".hpp"].includes(ext)) {
    // Functions
    const cFuncRegex = /(?:^|\n)\s*(?:\w+\s+)*?(\w+)\s*\([^)]*\)\s*\{/g;
    let cMatch = cFuncRegex.exec(content);
    while (cMatch !== null) {
      if (
        cMatch[1] &&
        !["if", "while", "for", "switch", "catch"].includes(cMatch[1])
      ) {
        symbols.push(cMatch[1]);
      }
      cMatch = cFuncRegex.exec(content);
    }

    // Structs, classes (C++), and enums
    const cTypeRegex = /(?:struct|class|enum)\s+(\w+)/g;
    cMatch = cTypeRegex.exec(content);
    while (cMatch !== null) {
      if (cMatch[1]) symbols.push(cMatch[1]);
      cMatch = cTypeRegex.exec(content);
    }
  }

  // Remove duplicates
  return [...new Set(symbols)];
};

/**
 * Extract symbols (functions, classes, etc.) from code content
 * Uses tree-sitter when available, falls back to regex patterns
 */
export const extractSymbols = async (
  content: string,
  fileName: string,
): Promise<string[]> => {
  const ext = extname(fileName).toLowerCase();
  const language = getLanguageFromExtension(ext);

  // Try tree-sitter first if language is supported
  if (language) {
    try {
      const factory = createParserFactory();
      const parser = await factory.createParser(fileName);
      if (parser) {
        const tree = parser.parse(content);
        const symbols = extractSymbolsFromCST(tree.rootNode, language);
        if (symbols.length > 0) {
          return [...new Set(symbols)]; // Remove duplicates
        }
      }
    } catch (error) {
      // Fall back to regex if tree-sitter fails
      console.warn(
        `Tree-sitter parsing failed for ${fileName}, falling back to regex:`,
        error,
      );
    }
  }

  // Fallback to regex-based extraction
  return extractSymbolsWithRegex(content, ext);
};

/**
 * Generate search queries from diff changes
 */
export const generateSearchQueries = (changes: DiffChange[]): string[] => {
  const queries: string[] = [];

  for (const change of changes) {
    // Add full file path components as queries
    const pathParts = change.file.split("/");
    for (const part of pathParts) {
      const cleanPart = part.replace(/\.[^.]+$/, ""); // Remove extension
      if (cleanPart && cleanPart.length > 2) {
        queries.push(cleanPart);

        // Also add space-separated version for compound names
        const spaceSeparated = cleanPart
          .replace(/[-_]/g, " ")
          .replace(/([A-Z])/g, " $1")
          .trim()
          .toLowerCase();
        if (
          spaceSeparated !== cleanPart.toLowerCase() &&
          spaceSeparated.length > 2
        ) {
          queries.push(spaceSeparated);
        }
      }
    }

    // Add symbol-based queries
    for (const symbol of change.symbols) {
      queries.push(symbol);

      // Convert camelCase/PascalCase to space-separated words
      const words = symbol
        .replace(/([A-Z])/g, " $1")
        .trim()
        .toLowerCase();
      if (words !== symbol.toLowerCase() && words.length > 2) {
        queries.push(words);
      }

      // Also add snake_case and kebab-case variations
      const snakeOrKebab = symbol.replace(/[-_]/g, " ").toLowerCase();
      if (snakeOrKebab !== symbol.toLowerCase() && snakeOrKebab !== words) {
        queries.push(snakeOrKebab);
      }
    }

    // Extract meaningful phrases from content (expanded)
    const contentWords = change.content
      .split(/\s+/)
      .filter((word) => {
        // More lenient filtering - include shorter words and some special chars
        const cleanWord = word.replace(/[^a-zA-Z0-9_-]/g, "");
        return cleanWord.length > 2 && /^[a-zA-Z]/.test(cleanWord);
      })
      .slice(0, 20); // Increase word limit

    // Create various phrase combinations
    if (contentWords.length >= 2) {
      // 2-word phrases
      for (let i = 0; i < Math.min(contentWords.length - 1, 5); i++) {
        queries.push(`${contentWords[i]} ${contentWords[i + 1]}`);
      }

      // 3-word phrases
      if (contentWords.length >= 3) {
        for (let i = 0; i < Math.min(contentWords.length - 2, 3); i++) {
          queries.push(
            `${contentWords[i]} ${contentWords[i + 1]} ${contentWords[i + 2]}`,
          );
        }
      }
    }

    // Add individual important words from content
    for (const word of contentWords.slice(0, 10)) {
      if (word.length > 3) {
        queries.push(word.toLowerCase());
      }
    }
  }

  // Remove duplicates and empty strings, then limit
  const uniqueQueries = [...new Set(queries)]
    .filter((q) => q && q.trim().length > 0)
    .slice(0, 30); // Increase limit from 20 to 30

  return uniqueQueries;
};

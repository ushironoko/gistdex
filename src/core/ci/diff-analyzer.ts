import { extname } from "node:path";
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

      const symbols = extractSymbols(content, file);

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

  for (const line of lines) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      // Added lines
      relevantLines.push(line.slice(1));
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      // Removed lines
      relevantLines.push(line.slice(1));
    }
  }

  return relevantLines.join("\n");
};

/**
 * Extract symbols (functions, classes, etc.) from code content
 */
export const extractSymbols = (content: string, fileName: string): string[] => {
  const symbols: string[] = [];
  const ext = extname(fileName).toLowerCase();

  // TypeScript/JavaScript
  if ([".ts", ".tsx", ".js", ".jsx", ".mjs"].includes(ext)) {
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

  // Remove duplicates
  return [...new Set(symbols)];
};

/**
 * Generate search queries from diff changes
 */
export const generateSearchQueries = (changes: DiffChange[]): string[] => {
  const queries: string[] = [];

  for (const change of changes) {
    // Add file name based queries
    const fileName = change.file
      .split("/")
      .pop()
      ?.replace(/\.[^.]+$/, "");
    if (fileName) {
      queries.push(fileName);
    }

    // Add symbol-based queries
    for (const symbol of change.symbols) {
      queries.push(symbol);

      // Convert camelCase/PascalCase to space-separated words
      const words = symbol
        .replace(/([A-Z])/g, " $1")
        .trim()
        .toLowerCase();
      if (words !== symbol.toLowerCase()) {
        queries.push(words);
      }
    }

    // Extract meaningful phrases from content (limited)
    const contentWords = change.content
      .split(/\s+/)
      .filter((word) => word.length > 3 && /^[a-zA-Z]+$/.test(word))
      .slice(0, 10);

    // Create phrases from content words
    if (contentWords.length >= 2) {
      queries.push(contentWords.slice(0, 3).join(" "));
    }
  }

  // Remove duplicates and limit number of queries
  return [...new Set(queries)].slice(0, 20);
};

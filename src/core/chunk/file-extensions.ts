/**
 * Centralized file extension definitions and mappings
 * This module provides a single source of truth for all file extension handling
 */

// Centralized list of supported languages for CST parsing
export const SUPPORTED_LANGUAGES = [
  "javascript",
  "typescript",
  "tsx",
  "python",
  "go",
  "rust",
  "java",
  "ruby",
  "c",
  "cpp",
  "html",
  "css",
  "bash",
  "vue",
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * File extensions type
 */
export type FileExtension = `.${string}`;

/**
 * All text file extensions supported by the system
 * Based on indexer.ts TEXT_EXTENSIONS
 */
export const TEXT_EXTENSIONS = new Set<FileExtension>([
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
]);

/**
 * Language parser mapping for tree-sitter support
 * Based on parser-factory.ts LANGUAGE_PARSERS
 */
export const LANGUAGE_PARSERS = new Map<FileExtension, SupportedLanguage>([
  // JavaScript/TypeScript ecosystem
  [".js", "javascript"],
  [".jsx", "javascript"],
  [".ts", "typescript"],
  [".tsx", "tsx"],
  [".mjs", "javascript"],
  [".mts", "typescript"],
  [".cjs", "javascript"],
  // Python
  [".py", "python"],
  // Go
  [".go", "go"],
  // Rust
  [".rs", "rust"],
  // Java
  [".java", "java"],
  // Ruby
  [".rb", "ruby"],
  // C/C++
  [".c", "c"],
  [".cpp", "cpp"],
  [".h", "c"],
  // Web
  [".html", "html"],
  [".css", "css"],
  [".scss", "css"],
  [".sass", "css"],
  // Shell
  [".sh", "bash"],
  [".bash", "bash"],
  // Vue
  [".vue", "vue"],
]);

/**
 * Extensions supported by tree-sitter parsers
 */
export const TREE_SITTER_SUPPORTED = new Set<FileExtension>(
  Array.from(LANGUAGE_PARSERS.keys()),
);

/**
 * Code file extensions for boundary-aware chunking
 * Based on original chunking.ts codeExtensions array
 */
export const CODE_EXTENSIONS = new Set<FileExtension>([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".py",
  ".java",
  ".cs",
  ".rb",
  ".go",
  ".rs",
  ".cpp",
  ".c",
  ".h",
]);

/**
 * Markdown file extensions
 */
export const MARKDOWN_EXTENSIONS = new Set<FileExtension>([".md", ".mdx"]);

/**
 * Configuration file extensions
 */
export const CONFIG_EXTENSIONS = new Set<FileExtension>([
  ".json",
  ".yaml",
  ".yml",
  ".toml",
]);

/**
 * Type guard to check if a string is a supported language
 */
export function isSupportedLanguage(
  language: string,
): language is SupportedLanguage {
  return SUPPORTED_LANGUAGES.includes(language as SupportedLanguage);
}

/**
 * Get the programming language name for a file extension
 */
export function getLanguageFromExtension(
  ext: string,
): SupportedLanguage | undefined {
  return LANGUAGE_PARSERS.get(ext.toLowerCase() as FileExtension);
}

/**
 * Check if an extension is supported by tree-sitter
 */
export function isTreeSitterSupported(ext: string): boolean {
  return TREE_SITTER_SUPPORTED.has(ext.toLowerCase() as FileExtension);
}

/**
 * Check if a file is a code file (for boundary-aware chunking)
 */
export function isCodeFile(ext: string): boolean {
  return CODE_EXTENSIONS.has(ext.toLowerCase() as FileExtension);
}

/**
 * Check if a file is a markdown file
 */
export function isMarkdownFile(ext: string): boolean {
  return MARKDOWN_EXTENSIONS.has(ext.toLowerCase() as FileExtension);
}

/**
 * Check if a file is a supported text file
 */
export function isTextFile(filenameOrExt: string): boolean {
  // Handle both filename (e.g., "file.txt") and extension (e.g., ".txt")
  const ext =
    filenameOrExt.includes(".") && !filenameOrExt.startsWith(".")
      ? filenameOrExt.substring(filenameOrExt.lastIndexOf(".")).toLowerCase()
      : filenameOrExt.toLowerCase();

  return TEXT_EXTENSIONS.has(ext as FileExtension);
}

/**
 * Extension categories for classification
 */
export type ExtensionCategory =
  | "code"
  | "documentation"
  | "config"
  | "style"
  | "data"
  | "other";

/**
 * Get category for a file extension
 */
export function getExtensionCategory(ext: string): ExtensionCategory {
  const extension = ext.toLowerCase() as FileExtension;

  if (CODE_EXTENSIONS.has(extension)) {
    return "code";
  }
  if (MARKDOWN_EXTENSIONS.has(extension)) {
    return "documentation";
  }
  if (CONFIG_EXTENSIONS.has(extension)) {
    return "config";
  }
  if (extension === ".css" || extension === ".scss" || extension === ".sass") {
    return "style";
  }
  if (extension === ".xml" || extension === ".xmlx") {
    return "data";
  }
  return "other";
}

/**
 * Get human-readable language name for an extension
 */
export function getLanguageDisplayName(ext: string): string | undefined {
  const language = getLanguageFromExtension(ext);
  if (!language) return undefined;

  const displayNames: Record<SupportedLanguage, string> = {
    javascript: "JavaScript",
    typescript: "TypeScript",
    tsx: "TypeScript (TSX)",
    python: "Python",
    go: "Go",
    rust: "Rust",
    java: "Java",
    ruby: "Ruby",
    c: "C",
    cpp: "C++",
    html: "HTML",
    css: "CSS",
    bash: "Bash/Shell",
    vue: "Vue",
  };

  return displayNames[language];
}

/**
 * Extension information for database storage
 */
export interface ExtensionInfo {
  extension: string;
  language?: string;
  category: ExtensionCategory;
  displayName?: string;
}

/**
 * Get complete extension information
 */
export function getExtensionInfo(filenameOrExt: string): ExtensionInfo {
  const ext =
    filenameOrExt.includes(".") && !filenameOrExt.startsWith(".")
      ? filenameOrExt.substring(filenameOrExt.lastIndexOf(".")).toLowerCase()
      : filenameOrExt.toLowerCase();

  const language = getLanguageFromExtension(ext);
  const category = getExtensionCategory(ext);
  const displayName = getLanguageDisplayName(ext);

  return {
    extension: ext,
    language,
    category,
    displayName,
  };
}

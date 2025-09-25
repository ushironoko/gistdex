import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import type { Language } from "web-tree-sitter";
import Parser from "web-tree-sitter";
import { createCachedFactory } from "../utils/factory-helper.js";
import {
  isSupportedLanguage,
  type SupportedLanguage,
} from "./file-extensions.js";

// Create require function for resolving module paths in ESM
const require = createRequire(import.meta.url);

// Initialize web-tree-sitter once
let isInitialized = false;
const initializeParser = async () => {
  if (!isInitialized) {
    // Load tree-sitter.wasm from web-tree-sitter package
    try {
      // Try to load from node_modules (works for both local and global installs)
      const treeSitterWasmPath = require.resolve(
        "web-tree-sitter/tree-sitter.wasm",
      );
      const wasmModule = await readFile(treeSitterWasmPath);
      await Parser.init(wasmModule);
    } catch {
      // Fallback: let web-tree-sitter handle it automatically
      await Parser.init();
    }
    isInitialized = true;
  }
};

// Cache for loaded languages
const languageCache = new Map<SupportedLanguage, Language>();

// Load a language WASM file
const loadLanguage = async (
  languageName: SupportedLanguage,
): Promise<Language | null> => {
  if (languageCache.has(languageName)) {
    const cached = languageCache.get(languageName);
    if (cached) return cached;
  }

  try {
    // Construct WASM filename from language name
    const wasmFileName = `tree-sitter-${languageName}.wasm`;

    // Load from tree-sitter-wasms package
    const wasmPath = require.resolve(`tree-sitter-wasms/out/${wasmFileName}`);

    // Read the WASM file as buffer
    const wasmBuffer = await readFile(wasmPath);

    // Load the language from buffer
    const language = await Parser.Language.load(wasmBuffer);
    languageCache.set(languageName, language);
    return language;
  } catch (error) {
    if (process.env.DEBUG_GISTDEX) {
      console.debug(`Failed to load WASM for ${languageName}:`, error);
    }
    return null;
  }
};

// Parser factory interface
export interface ParserFactory {
  createParser: (language: string) => Promise<Parser | null>;
  dispose: () => void;
}

// Parser factory function with improved caching
export const createParserFactory = (): ParserFactory => {
  const parsers = new Map<string, Parser>();

  // Create cached factory for each language parser
  const cachedParsers = new Map<
    string,
    ReturnType<typeof createCachedFactory<Parser | null>>
  >();

  const createParserInternal = async (
    language: string,
  ): Promise<Parser | null> => {
    // Type guard to safely check if it's a SupportedLanguage
    if (!isSupportedLanguage(language)) {
      return null;
    }

    // Initialize web-tree-sitter if needed
    await initializeParser();

    // Load the language
    const lang = await loadLanguage(language);
    if (!lang) {
      return null;
    }

    // Create and configure the parser
    const parser = new Parser();
    parser.setLanguage(lang);
    parsers.set(language, parser);

    return parser;
  };

  const createParser = async (language: string): Promise<Parser | null> => {
    // Use cached factory for each language
    if (!cachedParsers.has(language)) {
      const cachedFactory = createCachedFactory(() =>
        createParserInternal(language),
      );
      cachedParsers.set(language, cachedFactory);
    }

    const cachedFactory = cachedParsers.get(language);
    return cachedFactory ? await cachedFactory.get() : null;
  };

  const dispose = () => {
    // Clean up parsers
    for (const parser of parsers.values()) {
      parser.delete();
    }
    parsers.clear();

    // Clear cached factories
    for (const cachedFactory of cachedParsers.values()) {
      cachedFactory.clear();
    }
    cachedParsers.clear();
  };

  return { createParser, dispose };
};

// Re-export Parser type for compatibility
export type { Parser };

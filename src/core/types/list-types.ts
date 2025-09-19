/**
 * Common type definitions for list functionality
 * Used by both CLI and MCP tools
 */

/**
 * Analysis of file extensions across indexed content
 */
export interface ExtensionAnalysis {
  [ext: string]: {
    count: number;
    sources: Set<string>;
    language?: string;
    category?: string;
  };
}

/**
 * Analysis of individual source with its chunks and extensions
 */
export interface SourceAnalysis {
  sourceId: string;
  title?: string;
  url?: string;
  sourceType?: string;
  chunks: number;
  extensions: Map<string, number>;
  firstSeen?: string;
}

/**
 * Formatted extension information for display
 */
export interface FormattedExtension {
  extension: string;
  count: number;
  sourceCount: number;
  language?: string;
  category?: string;
}

/**
 * Formatted source information for display
 */
export interface FormattedSource {
  sourceId: string;
  title?: string;
  url?: string;
  sourceType?: string;
  chunks: number;
  extensions?: Record<string, number>;
  firstSeen?: string;
}

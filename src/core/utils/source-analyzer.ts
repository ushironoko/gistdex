import { basename, extname } from "node:path";
import { getExtensionInfo } from "../chunk/file-extensions.js";
import type {
  ExtensionAnalysis,
  FormattedExtension,
  FormattedSource,
  SourceAnalysis,
} from "../types/list-types.js";
import type { VectorDocument } from "../vector-db/adapters/types.js";

/**
 * Analyzes database items to extract source and extension statistics
 */
export function analyzeItems(items: VectorDocument[]): {
  sourceMap: Map<string, SourceAnalysis>;
  extensionMap: ExtensionAnalysis;
} {
  const sourceMap = new Map<string, SourceAnalysis>();
  const extensionMap: ExtensionAnalysis = {};

  for (const item of items) {
    const metadata = item.metadata || {};
    const sourceId = metadata.sourceId || "unknown";

    // Update source analysis
    if (!sourceMap.has(sourceId)) {
      sourceMap.set(sourceId, {
        sourceId,
        title: metadata.title,
        url: metadata.url,
        sourceType: metadata.sourceType,
        chunks: 0,
        extensions: new Map(),
        firstSeen: metadata.createdAt,
      });
    }
    const source = sourceMap.get(sourceId);
    if (source) {
      source.chunks++;

      // Extract and analyze extensions
      if (metadata.url || metadata.filePath) {
        const path = (metadata.url || metadata.filePath) as string;
        const filename = basename(path);
        const ext = extname(filename).toLowerCase();

        if (ext) {
          // Update source extensions
          source.extensions.set(ext, (source.extensions.get(ext) || 0) + 1);

          // Update global extension analysis
          if (!extensionMap[ext]) {
            const extInfo = getExtensionInfo(ext);
            extensionMap[ext] = {
              count: 0,
              sources: new Set(),
              language: extInfo.displayName || extInfo.language,
              category: extInfo.category,
            };
          }
          extensionMap[ext].count++;
          extensionMap[ext].sources.add(sourceId);
        }
      }
    }
  }

  return { sourceMap, extensionMap };
}

/**
 * Formats extension analysis data for display
 */
export function formatExtensions(
  extensionMap: ExtensionAnalysis,
): FormattedExtension[] {
  return Object.entries(extensionMap)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([ext, data]) => ({
      extension: ext,
      count: data.count,
      sourceCount: data.sources.size,
      language: data.language,
      category: data.category,
    }));
}

/**
 * Formats source analysis data for display
 */
export function formatSources(
  sourceMap: Map<string, SourceAnalysis>,
  limit?: number,
): FormattedSource[] {
  const sources = Array.from(sourceMap.values()).sort(
    (a, b) => b.chunks - a.chunks,
  );

  const limitedSources = limit ? sources.slice(0, limit) : sources;

  return limitedSources.map((source) => ({
    sourceId: source.sourceId,
    title: source.title,
    url: source.url,
    sourceType: source.sourceType,
    chunks: source.chunks,
    extensions: Object.fromEntries(source.extensions),
    firstSeen: source.firstSeen,
  }));
}

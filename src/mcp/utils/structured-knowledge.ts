import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type StructuredKnowledge = {
  topic: string;
  content: string;
  metadata: Record<string, unknown>;
  lastUpdated: string;
};

export type KnowledgeUpdate = {
  content: string;
  metadata?: Record<string, unknown>;
};

/**
 * Save structured knowledge to a markdown file
 */
export async function saveStructuredKnowledge(
  knowledge: Omit<StructuredKnowledge, "lastUpdated">,
  cacheDir?: string,
): Promise<void> {
  const dir = cacheDir || getCacheDir();
  await ensureDirectory(dir);

  const fullKnowledge: StructuredKnowledge = {
    ...knowledge,
    lastUpdated: new Date().toISOString(),
  };

  const content = formatKnowledgeAsMarkdown(fullKnowledge);
  const sanitizedTopic = knowledge.topic.replace(/\s+/g, "_");
  const filePath = join(dir, `${sanitizedTopic}.md`);
  await writeFile(filePath, content, "utf-8");
}

/**
 * Update existing structured knowledge or create new if doesn't exist
 */
export async function updateStructuredKnowledge(
  topic: string,
  update: KnowledgeUpdate,
  cacheDir?: string,
): Promise<void> {
  const dir = cacheDir || getCacheDir();
  const existing = await loadStructuredKnowledge(topic, dir);

  if (existing) {
    const merged = mergeKnowledge(existing, update);
    await saveStructuredKnowledge(
      {
        topic: merged.topic,
        content: merged.content,
        metadata: merged.metadata,
      },
      dir,
    );
  } else {
    const newKnowledge: Omit<StructuredKnowledge, "lastUpdated"> = {
      topic,
      content: update.content,
      metadata: update.metadata || {},
    };
    await saveStructuredKnowledge(newKnowledge, dir);
  }
}

/**
 * Load structured knowledge from file
 */
export async function loadStructuredKnowledge(
  topic: string,
  cacheDir?: string,
): Promise<StructuredKnowledge | null> {
  const dir = cacheDir || getCacheDir();
  const sanitizedTopic = topic.replace(/\s+/g, "_");
  const filePath = join(dir, `${sanitizedTopic}.md`);

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = await readFile(filePath, "utf-8");
    return parseMarkdownToKnowledge(topic, content);
  } catch {
    return null;
  }
}

/**
 * Merge existing knowledge with update
 */
export function mergeKnowledge(
  existing: StructuredKnowledge,
  update: KnowledgeUpdate,
): Omit<StructuredKnowledge, "lastUpdated"> {
  const mergedMetadata = mergeMetadata(
    existing.metadata,
    update.metadata || {},
  );

  return {
    topic: existing.topic,
    content: existing.content + update.content,
    metadata: mergedMetadata,
  };
}

/**
 * Get cache directory path
 */
function getCacheDir(): string {
  const localCache = join(process.cwd(), ".gistdex", "cache");
  if (existsSync(dirname(localCache))) {
    return localCache;
  }
  // Fallback to home directory
  const { homedir } = require("node:os");
  return join(homedir(), ".gistdex", "cache");
}

/**
 * Ensure directory exists
 */
async function ensureDirectory(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

/**
 * Format knowledge as markdown
 */
function formatKnowledgeAsMarkdown(knowledge: StructuredKnowledge): string {
  const lines: string[] = [knowledge.content];

  // Add metadata section
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Metadata");
  lines.push("");
  lines.push(`Last Updated: ${knowledge.lastUpdated}`);

  for (const [key, value] of Object.entries(knowledge.metadata)) {
    const formattedKey = key.charAt(0).toUpperCase() + key.slice(1);
    if (Array.isArray(value)) {
      lines.push(`${formattedKey}: ${value.join(", ")}`);
    } else if (typeof value === "object" && value !== null) {
      lines.push(`${formattedKey}: ${JSON.stringify(value)}`);
    } else {
      lines.push(`${formattedKey}: ${value}`);
    }
  }

  return lines.join("\n");
}

/**
 * Parse markdown content back to knowledge object
 */
function parseMarkdownToKnowledge(
  topic: string,
  content: string,
): StructuredKnowledge {
  const lines = content.split("\n");
  const metadataIndex = lines.indexOf("## Metadata");

  let mainContent = content;
  let lastUpdated = new Date().toISOString();
  const metadata: Record<string, unknown> = {};

  if (metadataIndex !== -1) {
    // Extract main content (before metadata)
    const separatorIndex = lines.indexOf("---");
    if (separatorIndex !== -1 && separatorIndex < metadataIndex) {
      mainContent = lines.slice(0, separatorIndex).join("\n").trim();
    }

    // Parse metadata
    for (let i = metadataIndex + 2; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (!line) continue;

      const colonIndex = line.indexOf(":");
      if (colonIndex === -1) continue;

      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();

      if (key === "Last Updated") {
        lastUpdated = value;
      } else {
        const normalizedKey =
          key.charAt(0).toLowerCase() + key.slice(1).replace(/\s+/g, "");

        // Try to parse arrays - always split by comma for non-JSON arrays
        // This handles both single and multiple element arrays consistently
        if (!value.startsWith("{") && !value.startsWith("[")) {
          // Check if it looks like it should be an array (based on key name or containing comma)
          const shouldBeArray =
            normalizedKey.endsWith("s") || // plural keys often are arrays
            normalizedKey === "query" || // common array fields
            value.includes(",");

          if (shouldBeArray) {
            metadata[normalizedKey] = value.includes(",")
              ? value.split(",").map((v) => v.trim())
              : [value]; // Single item array
          } else {
            // Try to parse as number or keep as string
            const num = Number(value);
            metadata[normalizedKey] = Number.isNaN(num) ? value : num;
          }
        } else if (value.startsWith("{") || value.startsWith("[")) {
          try {
            metadata[normalizedKey] = JSON.parse(value);
          } catch {
            metadata[normalizedKey] = value;
          }
        }
      }
    }
  }

  return {
    topic,
    content: mainContent,
    metadata,
    lastUpdated,
  };
}

/**
 * Merge metadata objects intelligently
 */
function mergeMetadata(
  existing: Record<string, unknown>,
  update: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing };

  for (const [key, value] of Object.entries(update)) {
    if (key in merged) {
      const existingValue = merged[key];

      // Merge arrays
      if (Array.isArray(existingValue) && Array.isArray(value)) {
        merged[key] = [...new Set([...existingValue, ...value])];
      }
      // Add numbers
      else if (typeof existingValue === "number" && typeof value === "number") {
        merged[key] = existingValue + value;
      }
      // Merge objects
      else if (
        typeof existingValue === "object" &&
        existingValue !== null &&
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(existingValue) &&
        !Array.isArray(value)
      ) {
        merged[key] = { ...existingValue, ...value };
      }
      // Otherwise replace
      else {
        merged[key] = value;
      }
    } else {
      merged[key] = value;
    }
  }

  return merged;
}

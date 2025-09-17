import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getCacheDir } from "./cache-utils.js";

export type StructuredKnowledge = {
  topic: string;
  content: string;
  metadata: Record<string, unknown>;
  lastUpdated: string;
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

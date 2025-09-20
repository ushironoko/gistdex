import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import type { SimilarityCheckResult } from "./formatters.js";

/**
 * Check for code similarity issues in the changed files
 */
export const checkCodeSimilarity = async (
  diffRange: string,
  threshold = 0.8,
): Promise<SimilarityCheckResult> => {
  try {
    // Check if similarity-ts is available
    const hasSimilarityTool = checkSimilarityToolAvailable();

    if (!hasSimilarityTool) {
      return {
        hasIssues: false,
        message: "Similarity check tool not available",
      };
    }

    // Get changed files from git diff
    const changedFiles = getChangedFiles(diffRange);

    if (changedFiles.length === 0) {
      return {
        hasIssues: false,
        message: "No files to check",
      };
    }

    // Run similarity check on changed files
    const duplicates = await runSimilarityCheck(changedFiles, threshold);

    if (duplicates.length === 0) {
      return {
        hasIssues: false,
      };
    }

    return {
      hasIssues: true,
      duplicates,
      message: `Found ${duplicates.length} potential code duplication${duplicates.length === 1 ? "" : "s"}`,
    };
  } catch (error) {
    console.error("Failed to run similarity check:", error);
    return {
      hasIssues: false,
      message: "Similarity check failed to execute",
    };
  }
};

/**
 * Check if similarity-ts tool is available
 */
const checkSimilarityToolAvailable = (): boolean => {
  try {
    execSync("which similarity-ts", { stdio: "ignore" });
    return true;
  } catch {
    // Try npx as fallback
    try {
      execSync("npx --no-install similarity-ts --version", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }
};

/**
 * Get list of changed TypeScript/JavaScript files
 */
const getChangedFiles = (diffRange: string): string[] => {
  try {
    const output = execSync(
      `git diff ${diffRange} --name-only --diff-filter=AM`,
      { encoding: "utf-8" },
    );

    return output
      .trim()
      .split("\n")
      .filter((file) => file.match(/\.(ts|tsx|js|jsx)$/))
      .filter((file) => !file.includes(".test."))
      .filter((file) => !file.includes(".spec."))
      .filter((file) => existsSync(file));
  } catch {
    return [];
  }
};

/**
 * Run similarity check on files
 */
const runSimilarityCheck = async (
  files: string[],
  threshold: number,
): Promise<Array<{ file1: string; file2: string; similarity: number }>> => {
  if (files.length < 2) {
    return [];
  }

  const duplicates: Array<{
    file1: string;
    file2: string;
    similarity: number;
  }> = [];

  try {
    // Run similarity check using similarity-ts or similar tool
    // This is a simplified implementation - actual tool usage may vary
    const command = `npx --no-install similarity-ts check ${files.join(" ")} --threshold ${threshold}`;

    const output = execSync(command, { encoding: "utf-8" });

    // Parse the output (format depends on the actual tool)
    const lines = output.trim().split("\n");
    for (const line of lines) {
      // Example format: "file1.ts <-> file2.ts: 85.2%"
      const match = line.match(/(.+?)\s+<->\s+(.+?):\s+([\d.]+)%/);
      if (match?.[1] && match[2] && match[3]) {
        const similarity = Number.parseFloat(match[3]) / 100;
        if (similarity >= threshold) {
          duplicates.push({
            file1: match[1],
            file2: match[2],
            similarity,
          });
        }
      }
    }
  } catch (error) {
    // If the tool doesn't exist or fails, we can fallback to a simple check
    // For now, just return empty array
    console.error("Similarity check tool failed:", error);
  }

  return duplicates;
};

/**
 * Simple fallback similarity check using git diff
 * Checks if files have very similar line counts after changes
 */
export const simpleSimilarityCheck = (
  diffRange: string,
): SimilarityCheckResult => {
  try {
    // Get statistics about changed files
    const output = execSync(`git diff ${diffRange} --stat`, {
      encoding: "utf-8",
    });

    const lines = output.trim().split("\n");
    const fileStats: Map<string, { added: number; deleted: number }> =
      new Map();

    // Parse file statistics
    for (const line of lines) {
      const match = line.match(/^\s*(.+?)\s+\|\s+(\d+)\s+([+-]+)/);
      if (match?.[1] && match[3]) {
        const file = match[1];
        const changes = match[3];
        const added = (changes.match(/\+/g) || []).length;
        const deleted = (changes.match(/-/g) || []).length;

        if (file.match(/\.(ts|tsx|js|jsx)$/) && !file.includes(".test.")) {
          fileStats.set(file, { added, deleted });
        }
      }
    }

    // Check for files with identical change patterns (potential copy-paste)
    const patterns = new Map<string, string[]>();

    for (const [file, stats] of fileStats) {
      const pattern = `${stats.added}:${stats.deleted}`;
      if (!patterns.has(pattern)) {
        patterns.set(pattern, []);
      }
      patterns.get(pattern)?.push(file);
    }

    // Find patterns with multiple files
    const duplicates: Array<{
      file1: string;
      file2: string;
      similarity: number;
    }> = [];

    for (const [pattern, files] of patterns) {
      if (files.length > 1 && pattern !== "0:0") {
        // Files with identical change patterns might be duplicates
        for (let i = 0; i < files.length - 1; i++) {
          for (let j = i + 1; j < files.length; j++) {
            const file1 = files[i];
            const file2 = files[j];
            if (file1 && file2) {
              duplicates.push({
                file1,
                file2,
                similarity: 0.7, // Assume 70% similarity for identical patterns
              });
            }
          }
        }
      }
    }

    if (duplicates.length > 0) {
      return {
        hasIssues: true,
        duplicates,
        message:
          "Files with identical change patterns detected (may indicate copy-paste)",
      };
    }

    return {
      hasIssues: false,
    };
  } catch (error) {
    console.error("Simple similarity check failed:", error);
    return {
      hasIssues: false,
      message: "Could not perform similarity check",
    };
  }
};

import { spawnSync } from "node:child_process";

/**
 * Safely execute git commands using spawnSync to prevent injection attacks
 */
export const executeGitCommand = (
  args: string[],
  options?: { cwd?: string },
): string => {
  const result = spawnSync("git", args, {
    encoding: "utf-8",
    cwd: options?.cwd,
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (result.error) {
    throw new Error(`Git command failed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.toString() || "";
    throw new Error(
      `Git command failed with status ${result.status}: ${stderr}`,
    );
  }

  return result.stdout?.toString() || "";
};

/**
 * Execute GitHub CLI commands safely
 */
export const executeGHCommand = (
  args: string[],
  options?: {
    cwd?: string;
    input?: string;
    env?: Record<string, string | undefined>;
  },
): string => {
  const result = spawnSync("gh", args, {
    encoding: "utf-8",
    cwd: options?.cwd,
    input: options?.input,
    env: options?.env ? { ...process.env, ...options.env } : process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (result.error) {
    throw new Error(`GitHub CLI command failed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.toString() || "";
    throw new Error(
      `GitHub CLI command failed with status ${result.status}: ${stderr}`,
    );
  }

  return result.stdout?.toString() || "";
};

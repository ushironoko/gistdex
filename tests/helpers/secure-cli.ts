import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Secure CLI execution helper to prevent command injection vulnerabilities
 */

/**
 * Sanitize command arguments to prevent injection attacks
 */
function sanitizeArgs(args: string[]): string[] {
  return args.map((arg) => {
    // Remove potentially dangerous characters
    return arg.replace(/[;&|`$(){}[\]\\]/g, "");
  });
}

/**
 * Validate that a directory path is within the system temp directory
 */
function validateTempDir(tempDir: string): void {
  const resolvedTempDir = resolve(tempDir);
  const systemTmpDir = resolve(tmpdir());

  if (!resolvedTempDir.startsWith(systemTmpDir)) {
    throw new Error(
      `Invalid temp directory: ${tempDir}. Must be within ${systemTmpDir}`,
    );
  }
}

/**
 * Secure CLI execution using spawn instead of string concatenation
 */
export function runCLISecure(
  args: string[],
  options?: {
    cwd?: string;
    timeout?: number;
  },
): {
  stdout: string;
  stderr: string;
  code: number;
} {
  const cliPath = join(process.cwd(), "dist/cli/index.js");
  const sanitizedArgs = sanitizeArgs(args);

  // Validate working directory if provided
  if (options?.cwd) {
    validateTempDir(options.cwd);
  }

  try {
    const result = spawnSync("node", [cliPath, ...sanitizedArgs], {
      cwd: options?.cwd || process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "production",
        NODE_NO_WARNINGS: "1",
        VITEST: undefined,
      },
      encoding: "utf8",
      timeout: options?.timeout || 30000,
    });

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      const error = new Error("Command failed") as Error & {
        stdout?: string;
        stderr?: string;
        status?: number;
      };
      error.stdout = result.stdout || undefined;
      error.stderr = result.stderr || undefined;
      error.status = result.status || undefined;
      throw error;
    }

    return {
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      code: 0,
    };
  } catch (error) {
    const execError = error as {
      stdout?: Buffer | string;
      stderr?: Buffer | string;
      status?: number;
      output?: Array<Buffer | string | null>;
    };

    const stdout = execError.stdout?.toString() || "";
    const stderr = execError.stderr?.toString() || "";

    // Try to get output from the output property
    let combined = stdout || stderr;
    if (!combined && execError.output) {
      const outputStr = execError.output
        .filter(Boolean)
        .map((buf) => buf?.toString() || "")
        .join("");
      if (outputStr) combined = outputStr;
    }

    return {
      stdout: combined,
      stderr: stderr,
      code: execError.status || 1,
    };
  }
}

/**
 * Secure way to change directory and run CLI command
 */
export function runCLIInDirectory(
  tempDir: string,
  args: string[],
  options?: { timeout?: number },
): string {
  validateTempDir(tempDir);

  const cliPath = join(process.cwd(), "dist/cli/index.js");
  const sanitizedArgs = sanitizeArgs(args);

  try {
    const result = spawnSync("node", [cliPath, ...sanitizedArgs], {
      cwd: tempDir,
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "production",
        NODE_NO_WARNINGS: "1",
        VITEST: undefined,
      },
      timeout: options?.timeout || 30000,
    });

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      const error = new Error("Command failed") as Error & {
        stdout?: string;
        stderr?: string;
        status?: number;
      };
      error.stdout = result.stdout || undefined;
      error.stderr = result.stderr || undefined;
      error.status = result.status || undefined;
      throw error;
    }

    return result.stdout || "";
  } catch (error) {
    const execError = error as {
      stdout?: Buffer | string;
      stderr?: Buffer | string;
      output?: Array<Buffer | string | null>;
    };

    const stdout = execError.stdout?.toString() || "";
    const stderr = execError.stderr?.toString() || "";

    if (execError.output) {
      const outputStr = execError.output
        .filter(Boolean)
        .map((buf) => buf?.toString() || "")
        .join("");
      if (outputStr) return outputStr;
    }

    return stdout || stderr || "";
  }
}

/**
 * Parse command string into safe argument array
 */
export function parseCommand(commandString: string): string[] {
  // Simple command parsing - splits on spaces but preserves quoted strings
  const args: string[] = [];
  let current = "";
  let inQuotes = false;
  let quoteChar = "";

  for (let i = 0; i < commandString.length; i++) {
    const char = commandString[i];

    if ((char === '"' || char === "'") && !inQuotes) {
      inQuotes = true;
      quoteChar = char;
    } else if (char === quoteChar && inQuotes) {
      inQuotes = false;
      quoteChar = "";
    } else if (char === " " && !inQuotes) {
      if (current.trim()) {
        args.push(current.trim());
        current = "";
      }
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    args.push(current.trim());
  }

  return args;
}

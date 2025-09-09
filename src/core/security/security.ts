import { readlink, realpath } from "node:fs/promises";
import { isAbsolute, normalize, relative, resolve } from "node:path";
import { cwd } from "node:process";

/**
 * Security validation errors
 */
export class SecurityError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.code = code;
    this.name = "SecurityError";
  }
}

/**
 * Allowed domains for external resource access
 */
const ALLOWED_DOMAINS = [
  "gist.github.com",
  "api.github.com",
  "github.com",
  "raw.githubusercontent.com",
] as const;

/**
 * Base directories that are considered safe for file access
 * These are relative to the current working directory
 */
const DEFAULT_SAFE_BASE_PATHS = [
  ".", // Current directory
  "./docs",
  "./src",
  "./content",
  "./data",
] as const;

/**
 * Validates and sanitizes a file path to prevent path traversal attacks
 *
 * @param filePath - The file path to validate
 * @param baseDir - Optional base directory to restrict access to (defaults to cwd)
 * @param allowedBasePaths - Optional list of allowed base paths relative to baseDir
 * @returns The validated and resolved absolute path
 * @throws SecurityError if the path is unsafe
 */
export async function validateFilePath(
  filePath: string,
  baseDir: string = cwd(),
  allowedBasePaths: readonly string[] = DEFAULT_SAFE_BASE_PATHS,
): Promise<string> {
  if (!filePath || typeof filePath !== "string") {
    throw new SecurityError("Invalid file path provided", "INVALID_PATH");
  }

  // Normalize and decode the path to handle encoded characters
  const decodedPath = decodeURIComponent(filePath);
  const normalizedPath = normalize(decodedPath);

  // Check for dangerous patterns
  if (normalizedPath.includes("..")) {
    throw new SecurityError(
      'Path traversal detected: ".." not allowed',
      "PATH_TRAVERSAL",
    );
  }

  // Check for absolute paths to sensitive directories
  if (isAbsolute(normalizedPath)) {
    const dangerousPaths = [
      "/etc",
      "/root",
      "/home",
      "/var",
      "/usr/local",
      "/sys",
      "/proc",
    ];
    if (
      dangerousPaths.some((dangerous) => normalizedPath.startsWith(dangerous))
    ) {
      throw new SecurityError(
        "Access to system directories is not allowed",
        "SYSTEM_PATH_ACCESS",
      );
    }
  }

  // Resolve the path relative to the base directory
  const resolvedBase = resolve(baseDir);

  // Get the real base directory path to handle symbolic links consistently
  let realBase: string;
  try {
    realBase = await realpath(resolvedBase);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // Base directory doesn't exist yet, use resolved path
      realBase = resolvedBase;
    } else {
      throw new SecurityError(
        `Failed to resolve base directory: ${error instanceof Error ? error.message : String(error)}`,
        "PATH_RESOLUTION_ERROR",
      );
    }
  }

  const candidatePath = isAbsolute(normalizedPath)
    ? normalizedPath
    : resolve(realBase, normalizedPath);

  // Get the real path to handle symbolic links
  let realPath: string;
  try {
    realPath = await realpath(candidatePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // File doesn't exist, but we can still validate the path structure
      realPath = candidatePath;
    } else {
      throw new SecurityError(
        `Failed to resolve path: ${error instanceof Error ? error.message : String(error)}`,
        "PATH_RESOLUTION_ERROR",
      );
    }
  }

  // Check if the resolved path is within any of the allowed base paths
  let pathAllowed = false;
  for (const allowedBase of allowedBasePaths) {
    const resolvedAllowedBase = resolve(realBase, allowedBase);

    // Get the real path of the allowed base
    let realAllowedBase: string;
    try {
      realAllowedBase = await realpath(resolvedAllowedBase);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // Allowed base doesn't exist yet, use resolved path
        realAllowedBase = resolvedAllowedBase;
      } else {
        continue; // Skip this allowed base if we can't resolve it
      }
    }

    const relativePath = relative(realAllowedBase, realPath);

    // Path is allowed if it doesn't start with '..' (meaning it's within the base)
    // and doesn't contain '..' segments (no traversal)
    if (!relativePath.startsWith("..") && !relativePath.includes("..")) {
      pathAllowed = true;
      break;
    }
  }

  if (!pathAllowed) {
    throw new SecurityError(
      `File path "${filePath}" is outside allowed directories. Allowed base paths: ${allowedBasePaths.join(", ")}`,
      "PATH_NOT_ALLOWED",
    );
  }

  // Additional check for symbolic links pointing outside allowed paths
  if (realPath !== candidatePath) {
    try {
      const linkTarget = await readlink(candidatePath).catch(() => null);
      if (linkTarget && isAbsolute(linkTarget)) {
        // Re-validate the link target
        await validateFilePath(linkTarget, baseDir, allowedBasePaths);
      }
    } catch (_error) {
      // If we can't validate the symlink target, reject it for safety
      throw new SecurityError(
        "Symbolic link target validation failed",
        "SYMLINK_VALIDATION_ERROR",
      );
    }
  }

  return realPath;
}

/**
 * Validates that a URL is from an allowed domain
 *
 * @param url - The URL to validate
 * @returns true if the URL is from an allowed domain
 * @throws SecurityError if the URL is not allowed
 */
/**
 * Parse and validate a URL with common security checks
 * Shared utility to reduce duplication in URL validation functions
 */
function parseAndValidateUrl(url: string): URL {
  if (!url || typeof url !== "string") {
    throw new SecurityError("Invalid URL provided", "INVALID_URL");
  }

  try {
    return new URL(url);
  } catch (_error) {
    throw new SecurityError("Invalid URL format", "INVALID_URL_FORMAT");
  }
}

/**
 * Check if a hostname belongs to an allowed domain
 */
function isHostnameAllowed(hostname: string): boolean {
  const lowerHostname = hostname.toLowerCase();
  return ALLOWED_DOMAINS.some(
    (domain) =>
      lowerHostname === domain || lowerHostname.endsWith(`.${domain}`),
  );
}

export function validateExternalUrl(url: string): void {
  const parsedUrl = parseAndValidateUrl(url);

  // Only allow HTTPS for external resources
  if (parsedUrl.protocol !== "https:") {
    throw new SecurityError(
      "Only HTTPS URLs are allowed for external resources",
      "NON_HTTPS_URL",
    );
  }

  // Check if the domain is in the allowed list
  if (!isHostnameAllowed(parsedUrl.hostname)) {
    throw new SecurityError(
      `Domain "${parsedUrl.hostname}" is not allowed. Allowed domains: ${ALLOWED_DOMAINS.join(", ")}`,
      "DOMAIN_NOT_ALLOWED",
    );
  }
}

/**
 * Validates a GitHub repository URL
 *
 * @param url - The GitHub repository URL to validate
 * @returns Parsed repository information
 * @throws SecurityError if the URL is invalid or not allowed
 */
export function validateGitHubRepoUrl(url: string): {
  owner: string;
  repo: string;
} {
  validateExternalUrl(url);

  const parsedUrl = parseAndValidateUrl(url);

  // Ensure it's a GitHub URL
  if (!parsedUrl.hostname.endsWith("github.com")) {
    throw new SecurityError(
      "URL must be a GitHub repository URL",
      "NOT_GITHUB_URL",
    );
  }

  // Parse owner and repository from the path
  const pathParts = parsedUrl.pathname
    .split("/")
    .filter((part) => part.length > 0);

  if (pathParts.length < 2) {
    throw new SecurityError(
      "Invalid GitHub repository URL format",
      "INVALID_GITHUB_URL",
    );
  }

  const [owner, repo] = pathParts;

  if (!owner || !repo) {
    throw new SecurityError(
      "Unable to parse owner and repository from URL",
      "GITHUB_PARSE_ERROR",
    );
  }

  // Basic validation for owner and repo names
  const validNamePattern = /^[a-zA-Z0-9._-]+$/;
  if (!validNamePattern.test(owner) || !validNamePattern.test(repo)) {
    throw new SecurityError(
      "Invalid characters in owner or repository name",
      "INVALID_GITHUB_NAME",
    );
  }

  return {
    owner,
    repo: repo.replace(/\.git$/, ""), // Remove .git suffix if present
  };
}

/**
 * Validates a GitHub Gist URL
 *
 * @param url - The Gist URL to validate
 * @returns The Gist ID
 * @throws SecurityError if the URL is invalid or not allowed
 */
export function validateGistUrl(url: string): string {
  validateExternalUrl(url);

  const parsedUrl = parseAndValidateUrl(url);

  // Ensure it's a Gist URL
  if (parsedUrl.hostname !== "gist.github.com") {
    throw new SecurityError("URL must be a GitHub Gist URL", "NOT_GIST_URL");
  }

  // Extract Gist ID from the path
  const gistIdMatch = parsedUrl.pathname.match(/\/[\w-]+\/([a-f0-9]+)/);

  if (!gistIdMatch || !gistIdMatch[1]) {
    throw new SecurityError("Invalid Gist URL format", "INVALID_GIST_URL");
  }

  const gistId = gistIdMatch[1];

  // Validate Gist ID format (should be a hex string)
  if (!/^[a-f0-9]+$/.test(gistId)) {
    throw new SecurityError("Invalid Gist ID format", "INVALID_GIST_ID");
  }

  return gistId;
}

/**
 * Create a safe base directory path resolver
 *
 * @param baseDir - Base directory for operations
 * @param allowedSubPaths - Allowed subdirectories
 * @returns A function that validates paths within the safe base
 */
export function createSafePathValidator(
  baseDir: string = cwd(),
  allowedSubPaths: readonly string[] = DEFAULT_SAFE_BASE_PATHS,
) {
  const resolvedBaseDir = resolve(baseDir);

  return async (filePath: string): Promise<string> => {
    return validateFilePath(filePath, resolvedBaseDir, allowedSubPaths);
  };
}

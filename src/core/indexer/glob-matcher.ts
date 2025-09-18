import picomatch from "picomatch";

/**
 * Checks if a string contains glob pattern characters
 */
export function hasGlobPattern(pattern: string): boolean {
  return /[*?{}[\]()]/.test(pattern);
}

/**
 * Parse comma-separated patterns into an array
 */
export function parsePatterns(patternsString: string): string[] {
  return patternsString
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Create a matcher function for multiple glob patterns
 */
export function createGlobMatcher(
  patterns: string[],
): (path: string) => boolean {
  // If no patterns or empty patterns, match nothing
  if (patterns.length === 0) {
    return () => false;
  }

  // If any pattern is just empty string, it means match all at root level
  const hasRootPattern = patterns.some((p) => p === "" || p === ".");
  if (hasRootPattern) {
    // Include a pattern that matches root-level files
    const expandedPatterns = [
      ...patterns.filter((p) => p !== "" && p !== "."),
      "*", // Match all files at root level
    ];
    return picomatch(expandedPatterns.length > 0 ? expandedPatterns : ["*"]);
  }

  // Create matcher with picomatch
  return picomatch(patterns);
}

/**
 * Filter file paths using glob patterns
 */
export function filterPathsWithGlob(
  paths: string[],
  patterns: string[],
): string[] {
  const matcher = createGlobMatcher(patterns);
  return paths.filter((path) => matcher(path));
}

/**
 * Check if any pattern in the list contains glob characters
 */
export function hasAnyGlobPattern(patterns: string[]): boolean {
  return patterns.some((pattern) => hasGlobPattern(pattern));
}

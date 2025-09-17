/**
 * Common ranking and scoring utilities
 */

/**
 * Sort items by score in descending order (highest score first)
 */
export function sortByScore<T extends { score: number }>(items: T[]): T[];
export function sortByScore<T>(
  items: T[],
  scoreAccessor: (item: T) => number,
): T[];
export function sortByScore<T>(
  items: T[],
  scoreAccessor?: (item: T) => number,
): T[] {
  const getScore =
    scoreAccessor || ((item: T) => (item as T & { score: number }).score);

  return [...items].sort((a, b) => getScore(b) - getScore(a));
}

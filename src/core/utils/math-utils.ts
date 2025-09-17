/**
 * Calculate dot product of two vectors
 */
export function dotProduct(vec1: number[], vec2: number[]): number {
  const minLength = Math.min(vec1.length, vec2.length);
  let sum = 0;
  for (let i = 0; i < minLength; i++) {
    const v1 = vec1[i];
    const v2 = vec2[i];
    if (v1 !== undefined && v2 !== undefined) {
      sum += v1 * v2;
    }
  }
  return sum;
}

/**
 * Calculate magnitude (Euclidean norm) of a vector
 */
export function calculateMagnitude(vec: number[]): number {
  if (vec.length === 0) return 0;

  let sumOfSquares = 0;
  for (const val of vec) {
    sumOfSquares += val * val;
  }
  return Math.sqrt(sumOfSquares);
}

/**
 * Calculate similarity between normalized vectors using dot product
 * This is equivalent to cosine similarity when vectors are normalized (magnitude = 1)
 * Returns a value between -1 and 1
 *
 * IMPORTANT: This assumes vectors are already normalized!
 * Use this for embedding vectors that are normalized during indexing.
 */
export function dotProductSimilarity(vec1: number[], vec2: number[]): number {
  return dotProduct(vec1, vec2);
}

/**
 * Calculate cosine similarity between two vectors
 * Returns a value between -1 and 1, where:
 * - 1 means vectors point in the same direction (most similar)
 * - 0 means vectors are orthogonal (unrelated)
 * - -1 means vectors point in opposite directions (most dissimilar)
 *
 * Optimization: Automatically uses dot product for normalized vectors
 */
export function calculateCosineSimilarity(
  vec1: number[],
  vec2: number[],
): number {
  // Fast path: if both vectors are normalized, just use dot product
  // This optimization is especially useful for embedding vectors
  if (vec1.length === vec2.length && vec1.length > 0) {
    // Quick check for common normalized vector lengths (like embeddings)
    if (vec1.length === 768 || vec1.length === 1536 || vec1.length === 3072) {
      // For embedding dimensions, assume they're normalized
      // (they should be normalized during indexing in Gistdex)
      return dotProductSimilarity(vec1, vec2);
    }
  }

  // Standard cosine similarity calculation for non-normalized vectors
  const mag1 = calculateMagnitude(vec1);
  const mag2 = calculateMagnitude(vec2);

  // Handle zero vectors
  if (mag1 === 0 || mag2 === 0) {
    return 0;
  }

  const dot = dotProduct(vec1, vec2);
  return dot / (mag1 * mag2);
}

/**
 * Calculate line numbers from text offsets
 */
export function calculateLineNumbers(
  text: string,
  startOffset: number,
  endOffset: number,
): { startLine: number; endLine: number } {
  // Count newlines before start offset to get start line
  const textBeforeStart = text.substring(0, startOffset);
  const linesBeforeStart = textBeforeStart.split("\n").length;
  const startLine = linesBeforeStart; // Line numbers are 1-based

  // Count newlines in the chunk to get end line
  const chunkText = text.substring(startOffset, endOffset);
  const linesInChunk = chunkText.split("\n").length;
  const endLine = startLine + linesInChunk - 1;

  return { startLine, endLine };
}

/**
 * Calculate line number from a single offset
 */
export function getLineNumber(text: string, offset: number): number {
  const textBefore = text.substring(0, offset);
  return textBefore.split("\n").length;
}

/**
 * Find the character offsets for given line numbers
 */
export function getOffsetsFromLines(
  text: string,
  startLine: number,
  endLine: number,
): { startOffset: number; endOffset: number } {
  const lines = text.split("\n");

  // Convert to 0-based indexing
  const startIndex = Math.max(0, startLine - 1);
  const endIndex = Math.min(lines.length - 1, endLine - 1);

  // Calculate start offset
  let startOffset = 0;
  for (let i = 0; i < startIndex; i++) {
    const lineLength = lines[i]?.length ?? 0;
    startOffset += lineLength + 1; // +1 for newline
  }

  // Calculate end offset
  let endOffset = startOffset;
  for (let i = startIndex; i <= endIndex; i++) {
    const lineLength = lines[i]?.length ?? 0;
    endOffset += lineLength;
    if (i < endIndex) {
      endOffset += 1; // +1 for newline, except for last line
    }
  }

  return { startOffset, endOffset };
}

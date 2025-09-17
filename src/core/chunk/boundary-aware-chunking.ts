/**
 * Boundary-aware chunking for maintaining semantic boundaries in content
 */

export interface BoundaryChunkOptions {
  maxChunkSize: number;
  overlap: number;
}

export interface BoundaryInfo {
  type: string;
  level?: number;
  name?: string;
  title?: string;
}

export interface BoundaryChunk {
  content: string;
  startOffset: number;
  endOffset: number;
  boundary: BoundaryInfo;
}

/**
 * Simple markdown section parser without external dependencies
 */
function parseMarkdownSections(markdown: string): Array<{
  content: string;
  startOffset: number;
  endOffset: number;
  type: string;
  level?: number;
  title?: string;
}> {
  const sections: Array<{
    content: string;
    startOffset: number;
    endOffset: number;
    type: string;
    level?: number;
    title?: string;
  }> = [];

  const lines = markdown.split("\n");
  let currentSection: {
    lines: string[];
    startOffset: number;
    type: string;
    level?: number;
    title?: string;
  } | null = null;

  let offset = 0;
  let inCodeBlock = false;
  let codeBlockStart = 0;
  let codeBlockLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || "";
    const nextOffset = offset + line.length + 1; // +1 for newline

    // Handle code blocks
    if (line.startsWith("```")) {
      if (!inCodeBlock) {
        // Start of code block
        if (currentSection) {
          sections.push({
            content: currentSection.lines.join("\n"),
            startOffset: currentSection.startOffset,
            endOffset: offset - 1,
            type: currentSection.type,
            level: currentSection.level,
            title: currentSection.title,
          });
          currentSection = null;
        }
        inCodeBlock = true;
        codeBlockStart = offset;
        codeBlockLines = [line];
      } else {
        // End of code block
        codeBlockLines.push(line);
        sections.push({
          content: codeBlockLines.join("\n"),
          startOffset: codeBlockStart,
          endOffset: nextOffset - 1,
          type: "code",
        });
        inCodeBlock = false;
        codeBlockLines = [];
      }
      offset = nextOffset;
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      offset = nextOffset;
      continue;
    }

    // Check for headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const headingLevel = headingMatch[1]?.length || 1;

      // Only create new section for h1 and h2
      if (headingLevel <= 2) {
        // Save previous section before starting a new heading
        if (currentSection) {
          sections.push({
            content: currentSection.lines.join("\n"),
            startOffset: currentSection.startOffset,
            endOffset: offset - 1,
            type: currentSection.type,
            level: currentSection.level,
            title: currentSection.title,
          });
        }

        // Start new heading section
        currentSection = {
          lines: [line],
          startOffset: offset,
          type: "heading",
          level: headingLevel,
          title: headingMatch[2],
        };
      } else if (currentSection) {
        // h3-h6: add to current section
        currentSection.lines.push(line);
      } else {
        // No current section, start a new one even for h3-h6
        currentSection = {
          lines: [line],
          startOffset: offset,
          type: "heading",
          level: headingLevel,
          title: headingMatch[2],
        };
      }
    } else if (currentSection && currentSection.type === "heading") {
      // We're in a heading section - add all content to it
      currentSection.lines.push(line);
    } else if (line.match(/^\s*[-*+]\s+/) || line.match(/^\s*\d+\.\s+/)) {
      // List item outside of heading section (including nested items with indentation)
      if (currentSection?.type !== "list") {
        if (currentSection) {
          sections.push({
            content: currentSection.lines.join("\n"),
            startOffset: currentSection.startOffset,
            endOffset: offset - 1,
            type: currentSection.type,
            level: currentSection.level,
            title: currentSection.title,
          });
        }
        currentSection = {
          lines: [line],
          startOffset: offset,
          type: "list",
        };
      } else {
        currentSection.lines.push(line);
      }
    } else if (line.trim() === "") {
      // Empty line
      if (currentSection) {
        currentSection.lines.push(line);
      }
    } else {
      // Regular text line
      if (!currentSection) {
        // Start new paragraph
        currentSection = {
          lines: [line],
          startOffset: offset,
          type: "paragraph",
        };
      } else {
        currentSection.lines.push(line);
      }
    }

    offset = nextOffset;
  }

  // Save final section
  if (currentSection) {
    sections.push({
      content: currentSection.lines.join("\n"),
      startOffset: currentSection.startOffset,
      endOffset: offset - 1,
      type: currentSection.type,
      level: currentSection.level,
      title: currentSection.title,
    });
  }

  return sections;
}

/**
 * Split markdown content by semantic boundaries
 */
export function chunkMarkdownByBoundary(
  markdown: string,
  options: BoundaryChunkOptions,
): BoundaryChunk[] {
  const sections = parseMarkdownSections(markdown);
  const chunks: BoundaryChunk[] = [];

  for (const section of sections) {
    if (section.content.length <= options.maxChunkSize) {
      // Section fits in one chunk
      chunks.push({
        content: section.content,
        startOffset: section.startOffset,
        endOffset: section.endOffset,
        boundary: {
          type: section.type,
          level: section.level,
          title: section.title,
        },
      });
    } else {
      // Section needs to be split
      const lines = section.content.split("\n");
      let currentChunk: string[] = [];
      let currentSize = 0;
      let chunkStartOffset = section.startOffset;

      for (const line of lines) {
        const lineSize = line.length + 1; // +1 for newline

        if (
          currentSize + lineSize > options.maxChunkSize &&
          currentChunk.length > 0
        ) {
          // Save current chunk
          chunks.push({
            content: currentChunk.join("\n"),
            startOffset: chunkStartOffset,
            endOffset: chunkStartOffset + currentSize - 1,
            boundary: {
              type: section.type,
              level: section.level,
              title: section.title,
            },
          });

          // Start new chunk with overlap
          const overlapLines = [];
          let overlapSize = 0;
          for (let i = currentChunk.length - 1; i >= 0; i--) {
            const overlapLine = currentChunk[i];
            if (overlapLine) {
              overlapSize += overlapLine.length + 1;
              if (overlapSize <= options.overlap) {
                overlapLines.unshift(overlapLine);
              } else {
                break;
              }
            }
          }

          currentChunk = [...overlapLines, line];
          chunkStartOffset = chunkStartOffset + currentSize - overlapSize;
          currentSize = overlapSize + lineSize;
        } else {
          currentChunk.push(line);
          currentSize += lineSize;
        }
      }

      // Save final chunk
      if (currentChunk.length > 0) {
        chunks.push({
          content: currentChunk.join("\n"),
          startOffset: chunkStartOffset,
          endOffset: section.endOffset,
          boundary: {
            type: section.type,
            level: section.level,
            title: section.title,
          },
        });
      }
    }
  }

  return chunks;
}

/**
 * Simple code boundary parser using regex patterns
 */
function parseCodeBoundaries(
  code: string,
  language: string,
): Array<{
  content: string;
  startOffset: number;
  endOffset: number;
  type: string;
  name?: string;
}> {
  const boundaries: Array<{
    content: string;
    startOffset: number;
    endOffset: number;
    type: string;
    name?: string;
  }> = [];

  // Patterns for different languages (currently using inline matching instead)
  // const patterns: Record<string, RegExp[]> = {
  //   javascript: [
  //     /^import\s+.+$/gm,
  //     /^export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)/gm,
  //     /^(?:async\s+)?function\s+(\w+)/gm,
  //     /^(?:export\s+)?(?:default\s+)?class\s+(\w+)/gm,
  //     /^(?:export\s+)?const\s+(\w+)\s*=/gm,
  //   ],
  //   typescript: [
  //     /^import\s+.+$/gm,
  //     /^export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)/gm,
  //     /^(?:async\s+)?function\s+(\w+)/gm,
  //     /^(?:export\s+)?(?:default\s+)?class\s+(\w+)/gm,
  //     /^(?:export\s+)?interface\s+(\w+)/gm,
  //     /^(?:export\s+)?type\s+(\w+)/gm,
  //     /^(?:export\s+)?const\s+(\w+)\s*=/gm,
  //   ],
  //   python: [
  //     /^import\s+.+$/gm,
  //     /^from\s+.+\s+import\s+.+$/gm,
  //     /^def\s+(\w+)/gm,
  //     /^class\s+(\w+)/gm,
  //     /^async\s+def\s+(\w+)/gm,
  //   ],
  // };
  const lines = code.split("\n");
  let currentBoundary: {
    lines: string[];
    startOffset: number;
    type: string;
    name?: string;
  } | null = null;

  let offset = 0;
  let inImports = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || "";
    const nextOffset = offset + line.length + 1;

    // Check for import statements
    if (line.match(/^import\s+/) || line.match(/^from\s+.+\s+import/)) {
      if (!inImports) {
        if (currentBoundary) {
          boundaries.push({
            content: currentBoundary.lines.join("\n"),
            startOffset: currentBoundary.startOffset,
            endOffset: offset - 1,
            type: currentBoundary.type,
            name: currentBoundary.name,
          });
        }
        inImports = true;
        currentBoundary = {
          lines: [line],
          startOffset: offset,
          type: "imports",
        };
      } else if (currentBoundary) {
        currentBoundary.lines.push(line);
      }
    } else if (inImports && line.trim() === "") {
      // End of imports section
      if (currentBoundary) {
        currentBoundary.lines.push(line);
      }
    } else {
      if (inImports) {
        // Save imports and start new boundary
        if (currentBoundary) {
          boundaries.push({
            content: currentBoundary.lines.join("\n"),
            startOffset: currentBoundary.startOffset,
            endOffset: offset - 1,
            type: currentBoundary.type,
            name: currentBoundary.name,
          });
        }
        inImports = false;
        currentBoundary = null;
      }

      // Check for function/class definitions
      let matched = false;

      if (
        line.match(
          /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)/,
        ) ||
        line.match(/^(?:async\s+)?function\s+(\w+)/) ||
        line.match(/^def\s+(\w+)/) ||
        line.match(/^async\s+def\s+(\w+)/)
      ) {
        const match = line.match(/(?:function|def)\s+(\w+)/);
        if (currentBoundary) {
          boundaries.push({
            content: currentBoundary.lines.join("\n"),
            startOffset: currentBoundary.startOffset,
            endOffset: offset - 1,
            type: currentBoundary.type,
            name: currentBoundary.name,
          });
        }
        currentBoundary = {
          lines: [line],
          startOffset: offset,
          type: "function",
          name: match?.[1],
        };
        matched = true;
      } else if (line.match(/^(?:export\s+)?(?:default\s+)?class\s+(\w+)/)) {
        const match = line.match(/class\s+(\w+)/);
        if (currentBoundary) {
          boundaries.push({
            content: currentBoundary.lines.join("\n"),
            startOffset: currentBoundary.startOffset,
            endOffset: offset - 1,
            type: currentBoundary.type,
            name: currentBoundary.name,
          });
        }
        currentBoundary = {
          lines: [line],
          startOffset: offset,
          type: "class",
          name: match?.[1],
        };
        matched = true;
      } else if (language === "typescript") {
        if (line.match(/^(?:export\s+)?interface\s+(\w+)/)) {
          const match = line.match(/interface\s+(\w+)/);
          if (currentBoundary) {
            boundaries.push({
              content: currentBoundary.lines.join("\n"),
              startOffset: currentBoundary.startOffset,
              endOffset: offset - 1,
              type: currentBoundary.type,
              name: currentBoundary.name,
            });
          }
          currentBoundary = {
            lines: [line],
            startOffset: offset,
            type: "interface",
            name: match?.[1],
          };
          matched = true;
        } else if (line.match(/^(?:export\s+)?type\s+(\w+)/)) {
          const match = line.match(/type\s+(\w+)/);
          if (currentBoundary) {
            boundaries.push({
              content: currentBoundary.lines.join("\n"),
              startOffset: currentBoundary.startOffset,
              endOffset: offset - 1,
              type: currentBoundary.type,
              name: currentBoundary.name,
            });
          }
          currentBoundary = {
            lines: [line],
            startOffset: offset,
            type: "type",
            name: match?.[1],
          };
          matched = true;
        }
      }

      if (!matched) {
        if (!currentBoundary) {
          currentBoundary = {
            lines: [line],
            startOffset: offset,
            type: "statement",
          };
        } else {
          currentBoundary.lines.push(line);
        }
      }
    }

    offset = nextOffset;
  }

  // Save final boundary
  if (currentBoundary) {
    boundaries.push({
      content: currentBoundary.lines.join("\n"),
      startOffset: currentBoundary.startOffset,
      endOffset: offset - 1,
      type: currentBoundary.type,
      name: currentBoundary.name,
    });
  }

  return boundaries;
}

/**
 * Split code by syntactic boundaries
 */
export function chunkCodeByBoundary(
  code: string,
  language: string,
  options: BoundaryChunkOptions,
): BoundaryChunk[] {
  const boundaries = parseCodeBoundaries(code, language);
  const chunks: BoundaryChunk[] = [];

  for (const boundary of boundaries) {
    if (boundary.content.length <= options.maxChunkSize) {
      // Boundary fits in one chunk
      chunks.push({
        content: boundary.content,
        startOffset: boundary.startOffset,
        endOffset: boundary.endOffset,
        boundary: {
          type: boundary.type,
          name: boundary.name,
        },
      });
    } else {
      // Boundary needs to be split (try to maintain logical units)
      const lines = boundary.content.split("\n");
      let currentChunk: string[] = [];
      let currentSize = 0;
      let chunkStartOffset = boundary.startOffset;

      for (const line of lines) {
        const lineSize = line.length + 1;

        if (
          currentSize + lineSize > options.maxChunkSize &&
          currentChunk.length > 0
        ) {
          // Save current chunk
          chunks.push({
            content: currentChunk.join("\n"),
            startOffset: chunkStartOffset,
            endOffset: chunkStartOffset + currentSize - 1,
            boundary: {
              type: boundary.type,
              name: boundary.name,
            },
          });

          // Start new chunk with overlap
          const overlapLines = [];
          let overlapSize = 0;
          for (let i = currentChunk.length - 1; i >= 0; i--) {
            const overlapLine = currentChunk[i];
            if (overlapLine) {
              overlapSize += overlapLine.length + 1;
              if (overlapSize <= options.overlap) {
                overlapLines.unshift(overlapLine);
              } else {
                break;
              }
            }
          }

          currentChunk = [...overlapLines, line];
          chunkStartOffset = chunkStartOffset + currentSize - overlapSize;
          currentSize = overlapSize + lineSize;
        } else {
          currentChunk.push(line);
          currentSize += lineSize;
        }
      }

      // Save final chunk
      if (currentChunk.length > 0) {
        chunks.push({
          content: currentChunk.join("\n"),
          startOffset: chunkStartOffset,
          endOffset: boundary.endOffset,
          boundary: {
            type: boundary.type,
            name: boundary.name,
          },
        });
      }
    }
  }

  return chunks;
}

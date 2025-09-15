/**
 * Common stop words for text processing
 */

/**
 * English stop words - comprehensive list
 */
export const ENGLISH_STOP_WORDS = new Set([
  // Articles
  "a",
  "an",
  "the",
  // Conjunctions
  "and",
  "or",
  "but",
  "nor",
  "yet",
  "so",
  // Prepositions
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "about",
  "into",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "between",
  "under",
  "over",
  // Pronouns
  "i",
  "you",
  "he",
  "she",
  "it",
  "we",
  "they",
  "me",
  "him",
  "her",
  "us",
  "them",
  "my",
  "your",
  "his",
  "her",
  "its",
  "our",
  "their",
  "this",
  "that",
  "these",
  "those",
  // Common verbs
  "is",
  "am",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "having",
  "do",
  "does",
  "did",
  "doing",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "must",
  "shall",
  "can",
  "need",
  "dare",
  "ought",
  "used",
  // Question words
  "what",
  "which",
  "who",
  "whom",
  "whose",
  "when",
  "where",
  "why",
  "how",
  // Common adverbs and others
  "not",
  "no",
  "nor",
  "too",
  "very",
  "just",
  "only",
  "quite",
  "now",
  "then",
  "once",
  "here",
  "there",
  "all",
  "any",
  "each",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "both",
  "either",
  "neither",
  "many",
  "much",
  "another",
  "own",
  "same",
  "so",
  "than",
  "up",
  "down",
  "out",
  "off",
  "again",
  "further",
  "also",
  "back",
  "well",
  "even",
  "still",
  "way",
  "because",
  "however",
  "if",
  "unless",
  "until",
  "while",
  "although",
  "though",
  "since",
  "as",
]);

/**
 * Japanese stop words - particles and common words
 */
export const JAPANESE_STOP_WORDS = new Set([
  // Particles
  "の",
  "に",
  "は",
  "を",
  "た",
  "が",
  "で",
  "て",
  "と",
  "し",
  "れ",
  "さ",
  "ある",
  "いる",
  "も",
  "する",
  "から",
  "な",
  "こと",
  "として",
  "い",
  "や",
  "など",
  "なる",
  "へ",
  "か",
  "だ",
  // Demonstratives
  "これ",
  "それ",
  "あれ",
  "この",
  "その",
  "あの",
  // Copula forms
  "です",
  "ます",
  "でした",
  "ました",
]);

/**
 * Combined stop words for multilingual support
 */
export const ALL_STOP_WORDS = new Set([
  ...ENGLISH_STOP_WORDS,
  ...JAPANESE_STOP_WORDS,
]);

/**
 * Remove stop words from text
 * @param text - Input text
 * @param languages - Languages to consider for stop word removal
 * @returns Array of words with stop words removed
 */
export function removeStopWords(
  text: string,
  languages: Array<"en" | "ja" | "all"> = ["all"],
): string[] {
  // Tokenize text - handle both English and Japanese
  const words = text
    .toLowerCase()
    .split(
      /[\s\u3000,;.!?()[\]{}:"'。、！？「」『』（）【】〈〉《》〔〕［］｛｝・]+/,
    )
    .filter((word) => word.length > 0);

  // Select appropriate stop words set
  let stopWords: Set<string>;
  if (languages.includes("all")) {
    stopWords = ALL_STOP_WORDS;
  } else {
    stopWords = new Set<string>();
    if (languages.includes("en")) {
      for (const word of ENGLISH_STOP_WORDS) {
        stopWords.add(word);
      }
    }
    if (languages.includes("ja")) {
      for (const word of JAPANESE_STOP_WORDS) {
        stopWords.add(word);
      }
    }
  }

  // Filter out stop words
  return words.filter((word) => !stopWords.has(word));
}

/**
 * Extract keywords from text (removes stop words and filters by frequency)
 * @param text - Input text
 * @param options - Options for keyword extraction
 * @returns Array of keywords
 */
export function extractKeywords(
  text: string,
  options: {
    languages?: Array<"en" | "ja" | "all">;
    minLength?: number;
    minFrequency?: number;
    topN?: number;
  } = {},
): string[] {
  const {
    languages = ["all"],
    minLength = 2,
    minFrequency = 1,
    topN = undefined,
  } = options;

  // Remove stop words
  const words = removeStopWords(text, languages).filter(
    (word) => word.length >= minLength,
  );

  // Count word frequency
  const wordFreq = new Map<string, number>();
  for (const word of words) {
    wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
  }

  // Filter by frequency and sort
  let keywords = Array.from(wordFreq.entries())
    .filter(([_, freq]) => freq >= minFrequency)
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word);

  // Limit to top N if specified
  if (topN !== undefined && topN > 0) {
    keywords = keywords.slice(0, topN);
  }

  return keywords;
}

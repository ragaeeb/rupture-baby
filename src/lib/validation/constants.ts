/**
 * Supported marker types for segments.
 */
export enum Markers {
    /** B - Book reference */
    Book = 'B',
    /** F - Footnote reference */
    Footnote = 'F',
    /** T - Heading reference */
    Heading = 'T',
    /** C - Chapter reference */
    Chapter = 'C',
    /** N - Note reference */
    Note = 'N',
    /** P - Plain segment */
    Plain = 'P',
}

/**
 * Regex parts for building translation marker patterns.
 */
export const TRANSLATION_MARKER_PARTS = {
    /** Dash variations (hyphen, en dash, em dash) */
    dashes: '[-–—]',
    /** Numeric portion of the reference */
    digits: '\\d+',
    /** Valid marker prefixes (Book, Chapter, Footnote, Translation, Page) */
    markers: `[${Object.values(Markers).join('')}]`,
    /** Optional whitespace before dash */
    optionalSpace: '\\s?',
    /** Valid single-letter suffixes */
    suffix: '[a-z]',
} as const;

/**
 * Pattern for a segment ID (e.g., P1234, B45a).
 */
export const MARKER_ID_PATTERN = `${TRANSLATION_MARKER_PARTS.markers}${TRANSLATION_MARKER_PARTS.digits}${TRANSLATION_MARKER_PARTS.suffix}?`;

export const MAX_EMPTY_PARENTHESES = 3;
export const MIN_ARABIC_LENGTH_FOR_TRUNCATION_CHECK = 50;
export const MIN_TRANSLATION_RATIO = 0.25;

export const COLON_PATTERN = /[:：]/g;

/**
 * Heuristic pattern for inferring speaker labels in English translations.
 * Matches 1-3 capitalized words ending with a colon (e.g., "Questioner:", "The Shaykh:").
 */
export const SPEAKER_LABEL_GUESS_PATTERN =
    /(?:^|\n|\s)([A-Z][\p{L}'ʿʾāīūḥṣḍṭẓ-]*(?:\s+[A-Z][\p{L}'ʿʾāīūḥṣḍṭẓ-]*){0,2})\s*:/gu;

export const DEFAULT_LEADING_PUNCTUATION = ['.', '?', '!', '…', '،', '؛', ':', '：', '-', '–', '—'];

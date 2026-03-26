/**
 * Segment type is shared across the library.
 */
import { MARKER_ID_PATTERN, SPEAKER_LABEL_GUESS_PATTERN, TRANSLATION_MARKER_PARTS } from './constants';
import type { Segment } from './types';

/**
 * Normalize line endings and split merged markers onto separate lines.
 *
 * @example
 * // "helloP1 - ..." becomes split onto a new line before "P1 -"
 * normalizeTranslationText('helloP1 - x').includes('\\nP1 -') === true
 */
export const normalizeTranslationText = (content: string) => {
    return normalizeTranslationTextWithMap(content).normalized;
};

const normalizeLineEndingsWithMap = (input: string) => {
    let normalized = '';
    const indexMap: number[] = [];
    for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        if (ch === '\r') {
            if (input[i + 1] === '\n') {
                normalized += '\n';
                indexMap.push(i);
                i++;
                continue;
            }
            normalized += '\n';
            indexMap.push(i);
            continue;
        }
        normalized += ch;
        indexMap.push(i);
    }
    return { indexMap, normalized };
};

const insertNewlinesBeforeMergedMarkers = (text: string, map: number[]) => {
    const mergedMarkerNoSpacePattern = new RegExp(
        `([^\\s\\n])(${MARKER_ID_PATTERN}${TRANSLATION_MARKER_PARTS.optionalSpace}${TRANSLATION_MARKER_PARTS.dashes})`,
        'g',
    );
    let normalized = '';
    const indexMap: number[] = [];
    let lastIndex = 0;
    for (const match of text.matchAll(mergedMarkerNoSpacePattern)) {
        const matchIndex = match.index ?? 0;
        for (let i = lastIndex; i < matchIndex; i++) {
            normalized += text[i];
            indexMap.push(map[i]);
        }
        normalized += match[1];
        indexMap.push(map[matchIndex]);
        normalized += '\n';
        indexMap.push(map[matchIndex]);
        const marker = match[2];
        for (let j = 0; j < marker.length; j++) {
            normalized += marker[j];
            indexMap.push(map[matchIndex + 1 + j]);
        }
        lastIndex = matchIndex + match[0].length;
    }
    for (let i = lastIndex; i < text.length; i++) {
        normalized += text[i];
        indexMap.push(map[i]);
    }
    return { indexMap, normalized };
};

const replaceSpaceBeforeMarkerWithNewline = (text: string, map: number[]) => {
    const mergedMarkerWithSpacePattern = new RegExp(
        ` (${MARKER_ID_PATTERN}${TRANSLATION_MARKER_PARTS.optionalSpace}${TRANSLATION_MARKER_PARTS.dashes})`,
        'g',
    );
    let normalized = '';
    const indexMap: number[] = [];
    let lastIndex = 0;
    for (const match of text.matchAll(mergedMarkerWithSpacePattern)) {
        const matchIndex = match.index ?? 0;
        for (let i = lastIndex; i < matchIndex; i++) {
            normalized += text[i];
            indexMap.push(map[i]);
        }
        normalized += '\n';
        indexMap.push(map[matchIndex]);
        const marker = match[1];
        for (let j = 0; j < marker.length; j++) {
            normalized += marker[j];
            indexMap.push(map[matchIndex + 1 + j]);
        }
        lastIndex = matchIndex + match[0].length;
    }
    for (let i = lastIndex; i < text.length; i++) {
        normalized += text[i];
        indexMap.push(map[i]);
    }
    return { indexMap, normalized };
};

const removeEscapedBrackets = (text: string, map: number[]) => {
    let normalized = '';
    const indexMap: number[] = [];
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '\\' && text[i + 1] === '[') {
            i++;
            normalized += '[';
            indexMap.push(map[i]);
            continue;
        }
        normalized += text[i];
        indexMap.push(map[i]);
    }
    return { indexMap, normalized };
};

export const normalizeTranslationTextWithMap = (content: string) => {
    const lineEndingNormalized = normalizeLineEndingsWithMap(content);
    const insertedNewlines = insertNewlinesBeforeMergedMarkers(
        lineEndingNormalized.normalized,
        lineEndingNormalized.indexMap,
    );
    const spaceReplaced = replaceSpaceBeforeMarkerWithNewline(insertedNewlines.normalized, insertedNewlines.indexMap);
    return removeEscapedBrackets(spaceReplaced.normalized, spaceReplaced.indexMap);
};

/**
 * Extract translation IDs from normalized response, in order.
 *
 * @example
 * extractTranslationIds('P1 - a\\nP2b - b') // => ['P1', 'P2b']
 */
export const extractTranslationIds = (text: string) => {
    const { dashes, optionalSpace } = TRANSLATION_MARKER_PARTS;
    const pattern = new RegExp(`^(${MARKER_ID_PATTERN})${optionalSpace}${dashes}`, 'gm');
    const ids: string[] = [];
    for (const match of text.matchAll(pattern)) {
        ids.push(match[1]);
    }
    return ids;
};

/**
 * Parses bulk translation text into a Map for efficient O(1) lookup.
 *
 * Handles multi-line translations: subsequent non-marker lines belong to the previous ID.
 *
 * @param rawText - Raw text containing translations in format "ID - Translation text"
 * @returns An object with `count` and `translationMap`
 *
 * @example
 * parseTranslations('P1 - a\\nP2 - b').count === 2
 */
export const parseTranslations = (rawText: string) => {
    const normalized = normalizeTranslationText(rawText);
    const translationMap = splitResponseById(normalized);
    return { count: translationMap.size, translationMap };
};

/**
 * Parse translations into an ordered array (preserving the original response order).
 *
 * This differs from `parseTranslations()` which returns a Map and therefore cannot represent
 * duplicates as separate entries.
 *
 * @param rawText - Raw text containing translations in format "ID - Translation text"
 * @returns Array of `{ id, translation }` entries in appearance order
 *
 * @example
 * parseTranslationsInOrder('P1 - a\\nP2 - b').map((e) => e.id) // => ['P1', 'P2']
 */
export const parseTranslationsInOrder = (rawText: string) => {
    const normalized = normalizeTranslationText(rawText);
    const { dashes, optionalSpace } = TRANSLATION_MARKER_PARTS;
    const headerPattern = new RegExp(`^(${MARKER_ID_PATTERN})${optionalSpace}${dashes}\\s*`, 'gm');
    const matches = [...normalized.matchAll(headerPattern)];

    const entries: Segment[] = [];
    for (let i = 0; i < matches.length; i++) {
        const id = matches[i][1];
        const start = matches[i].index ?? 0;
        const nextStart = i + 1 < matches.length ? (matches[i + 1].index ?? normalized.length) : normalized.length;
        const chunk = normalized.slice(start, nextStart).trimEnd();
        const prefixPattern = new RegExp(`^${id}${optionalSpace}${dashes}\\s*`);
        const text = chunk.replace(prefixPattern, '').trim();
        entries.push({ id, text });
    }
    return entries;
};

/**
 * Formats excerpts for an LLM prompt by combining the prompt rules with the segment text.
 * Each segment is formatted as "ID - Text" and separated by double newlines.
 *
 * @param segments - Array of segments to format
 * @param prompt - The instruction/system prompt to prepend
 * @returns Combined prompt and formatted text
 */
export const formatExcerptsForPrompt = (segments: Segment[], prompt: string) => {
    const formatted = segments.map((e) => `${e.id} - ${e.text}`).join('\n\n');
    return [prompt, formatted].join('\n\n');
};

/**
 * Split the response into a per-ID map. Values contain translation content only (prefix removed).
 *
 * @example
 * splitResponseById('P1 - a\\nP2 - b').get('P1') === 'a'
 */
export const splitResponseById = (text: string) => {
    const map = new Map<string, string>();
    for (const entry of parseTranslationsInOrder(text)) {
        map.set(entry.id, entry.text);
    }
    return map;
};

/**
 * Build a regex alternation for speaker labels (with trailing colon).
 *
 * @param labels - Speaker labels without trailing colons
 * @returns Regex alternation string (no flags)
 */
export const buildSpeakerLabelPattern = (labels: string[]) => {
    const parts = labels.map((label) => `${escapeRegExp(label)}\\s*:`).join('|');
    return `(?:${parts})`;
};

/**
 * Build a regex alternation for punctuation tokens.
 *
 * @param punctuation - Punctuation tokens to include
 * @returns Regex alternation string (no flags)
 */
export const buildPunctuationPattern = (punctuation: string[]) =>
    punctuation.map((token) => escapeRegExp(token)).join('|');

/**
 * Build a line-start regex for speaker labels, accounting for optional "ID - " prefix.
 *
 * @param labels - Speaker labels without trailing colons
 * @returns RegExp that matches line-start labels (with optional ID prefix)
 */
export const buildLineStartLabelPattern = (labels: string[]) => {
    const labelPattern = buildSpeakerLabelPattern(labels);
    const { dashes, optionalSpace } = TRANSLATION_MARKER_PARTS;
    return new RegExp(`^(?:${MARKER_ID_PATTERN}${optionalSpace}${dashes}\\s*)?(${labelPattern})`);
};

/**
 * Infer repeated speaker labels from the text (only labels that appear 2+ times).
 *
 * @param text - Full translation text
 * @returns Labels ordered by first appearance
 */
export const inferSpeakerLabels = (text: string) => {
    const counts = new Map<string, { count: number; firstIndex: number }>();

    for (const match of text.matchAll(SPEAKER_LABEL_GUESS_PATTERN)) {
        const label = match[1];
        if (!label) {
            continue;
        }
        const entry = counts.get(label);
        if (entry) {
            entry.count += 1;
        } else {
            counts.set(label, { count: 1, firstIndex: match.index ?? 0 });
        }
    }

    return [...counts.entries()]
        .filter(([, info]) => info.count >= 2)
        .sort((a, b) => a[1].firstIndex - b[1].firstIndex)
        .map(([label]) => label);
};

/**
 * Escape special regex characters in a literal string.
 *
 * @param s - Raw string to escape
 * @returns Escaped string safe for RegExp construction
 */
export const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

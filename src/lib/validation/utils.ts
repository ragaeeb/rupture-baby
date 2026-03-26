import {
    MARKER_ID_PATTERN,
    MAX_EMPTY_PARENTHESES,
    MIN_ARABIC_LENGTH_FOR_TRUNCATION_CHECK,
    MIN_TRANSLATION_RATIO,
    TRANSLATION_MARKER_PARTS,
} from './constants';
import { normalizeTranslationTextWithMap } from './textUtils';
import type {
    Range,
    Segment,
    TranslationMarker,
    ValidationConfig,
    ValidationContext,
    ValidationError,
    ValidationErrorType,
    ValidationResponseResult,
    ValidationRule,
} from './types';

/**
 * Human-readable descriptions for each `ValidationErrorType`, intended for client UIs and logs.
 *
 * @example
 * VALIDATION_ERROR_TYPE_INFO.arabic_leak.description
 */
export const VALIDATION_ERROR_TYPE_INFO = {
    all_caps: { description: 'ALL CAPS “shouting” detected (run of N uppercase words).' },
    arabic_leak: { description: 'Arabic script was detected in output (except ﷺ).' },
    collapsed_speakers: { description: 'Speaker labels appear mid-line instead of starting on a new line.' },
    duplicate_id: { description: 'The same segment ID appears more than once in the response.' },
    empty_parentheses: { description: 'Excessive "()" patterns detected, often indicating failed/empty term-pairs.' },
    invalid_marker_format: {
        description: 'A segment marker line is malformed (e.g., wrong ID shape or missing content after the dash).',
    },
    invented_id: {
        description: 'The response contains a segment ID that does not exist in the provided source corpus.',
    },
    length_mismatch: {
        description: 'Translation appears too short relative to Arabic source (heuristic truncation check).',
    },
    missing_id_gap: {
        description:
            'A gap was detected: the response includes two IDs whose corpus order implies one or more intermediate IDs are missing.',
    },
    multiword_translit_without_gloss: {
        description: 'A multi-word transliteration phrase was detected without an immediate parenthetical gloss.',
    },
    newline_after_id: {
        description: 'The response used "ID -\\nText" instead of "ID - Text" (newline immediately after the marker).',
    },
    no_valid_markers: { description: 'No valid "ID - ..." markers were found anywhere in the response.' },
    truncated_segment: { description: 'A segment appears truncated (e.g., only "…", "...", or "[INCOMPLETE]").' },
} as const satisfies Record<ValidationErrorType, { description: string }>;

const trimRange = (text: string, start: number, end: number) => {
    let s = start;
    let e = end;
    while (s < e && /\s/.test(text[s])) {
        s++;
    }
    while (e > s && /\s/.test(text[e - 1])) {
        e--;
    }
    return { end: e, start: s };
};

const toRawRange = (normalizedStart: number, normalizedEnd: number, indexMap: number[], rawLength: number): Range => {
    if (normalizedEnd <= normalizedStart) {
        const rawStart = indexMap[normalizedStart] ?? 0;
        return { end: rawStart, start: rawStart };
    }
    const rawStart = indexMap[normalizedStart] ?? 0;
    const rawEndBase = indexMap[Math.max(normalizedEnd - 1, normalizedStart)] ?? rawStart;
    const rawEnd = Math.min(rawLength, rawEndBase + 1);
    return { end: rawEnd, start: rawStart };
};

const findContainingMarker = (context: ValidationContext, normalizedStart: number, normalizedEnd: number) => {
    for (const marker of context.markers) {
        if (normalizedStart >= marker.translationStart && normalizedEnd <= marker.translationEnd) {
            return marker;
        }
    }
    return null;
};

const toSegmentRange = (marker: TranslationMarker, normalizedStart: number, normalizedEnd: number): Range => {
    const start = Math.max(marker.translationStart, normalizedStart) - marker.translationStart;
    const end = Math.max(marker.translationStart, normalizedEnd) - marker.translationStart;
    return { end, start };
};

const buildMarkers = (normalized: string, indexMap: number[], rawLength: number): TranslationMarker[] => {
    const { dashes, optionalSpace } = TRANSLATION_MARKER_PARTS;
    const headerPattern = new RegExp(`^(${MARKER_ID_PATTERN})${optionalSpace}${dashes}\\s*`, 'gm');
    const matches = [...normalized.matchAll(headerPattern)];
    const markers: TranslationMarker[] = [];

    for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const id = match[1];
        const normalizedStart = match.index ?? 0;
        const normalizedEnd = normalizedStart + match[0].length;
        const nextStart = i + 1 < matches.length ? (matches[i + 1].index ?? normalized.length) : normalized.length;
        const translationRange = trimRange(normalized, normalizedEnd, nextStart);
        const headerRange = toRawRange(normalizedStart, normalizedEnd, indexMap, rawLength);
        const translationRawRange = toRawRange(translationRange.start, translationRange.end, indexMap, rawLength);

        markers.push({
            headerText: match[0],
            id,
            normalizedEnd,
            normalizedStart,
            rawEnd: headerRange.end,
            rawStart: headerRange.start,
            rawTranslationEnd: translationRawRange.end,
            rawTranslationStart: translationRawRange.start,
            translationEnd: translationRange.end,
            translationStart: translationRange.start,
        });
    }

    return markers;
};

const buildResponseById = (markers: TranslationMarker[], normalized: string) => {
    const responseById = new Map<string, string>();
    for (const marker of markers) {
        const translationText = normalized.slice(marker.translationStart, marker.translationEnd).trim();
        responseById.set(marker.id, translationText);
    }
    return responseById;
};

const DEFAULT_VALIDATION_CONFIG: ValidationConfig = { allCapsWordRunThreshold: 5 };

const buildValidationContext = (
    segments: Segment[],
    rawResponse: string,
    config: ValidationConfig,
): ValidationContext => {
    const { normalized, indexMap } = normalizeTranslationTextWithMap(rawResponse);
    const markers = buildMarkers(normalized, indexMap, rawResponse.length);
    const parsedIds = markers.map((m) => m.id);
    const segmentById = new Map<string, Segment>();
    for (const s of segments) {
        segmentById.set(s.id, s);
    }
    const responseById = buildResponseById(markers, normalized);
    return {
        config,
        indexMap,
        markers,
        normalizedResponse: normalized,
        parsedIds,
        rawResponse,
        responseById,
        segmentById,
        segments,
    };
};

const makeErrorFromNormalized = (
    context: ValidationContext,
    type: ValidationErrorType,
    message: string,
    matchText: string,
    normalizedStart: number,
    normalizedEnd: number,
    id?: string,
): ValidationError => {
    let resolvedId = id;
    let containingMarker: TranslationMarker | null = null;
    if (!resolvedId) {
        containingMarker = findContainingMarker(context, normalizedStart, normalizedEnd);
        if (containingMarker) {
            resolvedId = containingMarker.id;
        }
    } else {
        containingMarker = context.markers.find((marker) => marker.id === resolvedId) ?? null;
    }

    return {
        id: resolvedId,
        matchText,
        message,
        range: toRawRange(normalizedStart, normalizedEnd, context.indexMap, context.rawResponse.length),
        segmentRange: containingMarker ? toSegmentRange(containingMarker, normalizedStart, normalizedEnd) : undefined,
        type,
    };
};

const makeErrorFromRawRange = (
    type: ValidationErrorType,
    message: string,
    matchText: string,
    range: Range,
    id?: string,
): ValidationError => ({ id, matchText, message, range, type });

/**
 * Validate an LLM translation response against a set of Arabic source segments.
 *
 * Rules are expressed as a list of typed errors. The caller decides severity.
 * The validator normalizes the response first (marker splitting + line endings).
 *
 * Important: `segments` may be the full corpus. The validator reduces to only
 * those IDs parsed from the response (plus detects missing-ID gaps between IDs).
 *
 * @example
 * // Pass (no errors)
 * validateTranslationResponse(
 *   [{ id: 'P1', text: 'نص عربي طويل...' }],
 *   'P1 - A complete translation.'
 * ).errors.length === 0
 *
 * @example
 * // Fail (invented ID)
 * validateTranslationResponse(
 *   [{ id: 'P1', text: 'نص عربي طويل...' }],
 *   'P2 - This ID is not in the corpus.'
 * ).errors.some(e => e.type === 'invented_id') === true
 */
export const validateTranslationResponse = (
    segments: Segment[],
    response: string,
    options?: { rules?: ValidationRule[]; config?: Partial<ValidationConfig> },
): ValidationResponseResult => {
    const config = { ...DEFAULT_VALIDATION_CONFIG, ...options?.config };
    const context = buildValidationContext(segments, response, config);
    if (context.parsedIds.length === 0) {
        return {
            errors: [
                {
                    matchText: response,
                    message: 'No valid translation markers found',
                    range: { end: response.length, start: 0 },
                    ruleId: 'no_valid_markers',
                    type: 'no_valid_markers',
                },
            ],
            normalizedResponse: context.normalizedResponse,
            parsedIds: [],
        };
    }

    const rules = options?.rules ?? DEFAULT_RULES;
    const errors = rules.flatMap((rule) => rule.run(context).map((e) => ({ ...e, ruleId: e.ruleId ?? rule.id })));

    return { errors, normalizedResponse: context.normalizedResponse, parsedIds: context.parsedIds };
};

/**
 * Validate translation marker format (single-line errors).
 *
 * @example
 * // Fail: malformed marker
 * validateMarkerFormat('B1234$5 - x')[0]?.type === 'invalid_marker_format'
 */
const validateMarkerFormat = (context: ValidationContext): ValidationError[] => {
    const text = context.normalizedResponse;
    const { markers, digits, suffix, dashes, optionalSpace } = TRANSLATION_MARKER_PARTS;
    const errors: ValidationError[] = [];

    const invalidRefPattern = new RegExp(
        `^${markers}(?=${digits})(?=.*${dashes})(?!${digits}${suffix}*${optionalSpace}${dashes})[^\\s-–—]+${optionalSpace}${dashes}`,
        'gm',
    );
    for (const match of text.matchAll(invalidRefPattern)) {
        const matchText = match[0];
        const idx = match.index ?? 0;
        errors.push(
            makeErrorFromNormalized(
                context,
                'invalid_marker_format',
                `Invalid reference format "${matchText.trim()}" - expected format is letter + numbers + optional suffix (a-j) + dash`,
                matchText,
                idx,
                idx + matchText.length,
            ),
        );
    }

    const spaceBeforePattern = new RegExp(` ${markers}${digits}${suffix}+${optionalSpace}${dashes}`, 'gm');
    for (const match of text.matchAll(spaceBeforePattern)) {
        const matchText = match[0];
        const idx = match.index ?? 0;
        errors.push(
            makeErrorFromNormalized(
                context,
                'invalid_marker_format',
                `Suspicious reference found: "${matchText}"`,
                matchText,
                idx,
                idx + matchText.length,
            ),
        );
    }

    const suffixNoDashPattern = new RegExp(`^${markers}${digits}${suffix}(?! ${dashes})`, 'gm');
    for (const match of text.matchAll(suffixNoDashPattern)) {
        const matchText = match[0];
        const idx = match.index ?? 0;
        errors.push(
            makeErrorFromNormalized(
                context,
                'invalid_marker_format',
                `Suspicious reference found: "${matchText}"`,
                matchText,
                idx,
                idx + matchText.length,
            ),
        );
    }

    const emptyAfterDashPattern = new RegExp(`^${MARKER_ID_PATTERN}${optionalSpace}${dashes}\\s*$`, 'gm');
    for (const match of text.matchAll(emptyAfterDashPattern)) {
        const matchText = match[0];
        const idx = match.index ?? 0;
        errors.push(
            makeErrorFromNormalized(
                context,
                'invalid_marker_format',
                `Reference "${matchText.trim()}" has dash but no content after it`,
                matchText,
                idx,
                idx + matchText.length,
            ),
        );
    }

    const dollarSignPattern = new RegExp(`^${markers}${digits}\\$${digits}`, 'gm');
    for (const match of text.matchAll(dollarSignPattern)) {
        const matchText = match[0];
        const idx = match.index ?? 0;
        errors.push(
            makeErrorFromNormalized(
                context,
                'invalid_marker_format',
                `Invalid reference format "${matchText}" - contains $ character`,
                matchText,
                idx,
                idx + matchText.length,
            ),
        );
    }

    return errors;
};

/**
 * Detect newline after an ID line (formatting bug).
 *
 * @example
 * // Fail: newline after "P1 -"
 * validateNewlineAfterId('P1 -\\nText')[0]?.type === 'newline_after_id'
 */
const validateNewlineAfterId = (context: ValidationContext): ValidationError[] => {
    const pattern = new RegExp(
        `^${MARKER_ID_PATTERN}${TRANSLATION_MARKER_PARTS.optionalSpace}${TRANSLATION_MARKER_PARTS.dashes}\\s*\\n`,
        'gm',
    );
    const errors: ValidationError[] = [];
    for (const match of context.normalizedResponse.matchAll(pattern)) {
        const matchText = match[0];
        const idx = match.index ?? 0;
        errors.push(
            makeErrorFromNormalized(
                context,
                'newline_after_id',
                `Invalid format: newline after ID "${matchText.trim()}" - use "ID - Text" format`,
                matchText,
                idx,
                idx + matchText.length,
            ),
        );
    }
    return errors;
};

/**
 * Detect segments that appear truncated (just "…" / "..." / "[INCOMPLETE]").
 *
 * @example
 * validateTruncatedSegments('P1 - …')[0]?.type === 'truncated_segment'
 */
const validateTruncatedSegments = (context: ValidationContext): ValidationError[] => {
    const errors: ValidationError[] = [];
    for (const marker of context.markers) {
        const content = context.normalizedResponse.slice(marker.translationStart, marker.translationEnd).trim();
        const isEllipsis = content === '…' || content === '...';
        const sourceText = context.segmentById.get(marker.id)?.text ?? '';
        const sourceIsEllipsisOnly = /^\s*(?:…|\.{3})\s*$/.test(sourceText);
        if (!content || content === '[INCOMPLETE]' || (isEllipsis && !sourceIsEllipsisOnly)) {
            errors.push(
                makeErrorFromRawRange(
                    'truncated_segment',
                    `Truncated segment detected: "${marker.id}" - segments must be fully translated`,
                    context.rawResponse.slice(marker.rawTranslationStart, marker.rawTranslationEnd),
                    { end: marker.rawTranslationEnd, start: marker.rawTranslationStart },
                    marker.id,
                ),
            );
        }
    }
    return errors;
};

/**
 * Detect Arabic script characters (except ﷺ).
 *
 * @example
 * validateArabicLeak('P1 - الله')[0]?.type === 'arabic_leak'
 *
 * @example
 * // Pass: ﷺ allowed
 * validateArabicLeak('P1 - Muḥammad ﷺ said...').length === 0
 */
const validateArabicLeak = (context: ValidationContext): ValidationError[] => {
    const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDF9\uFDFB-\uFDFF\uFE70-\uFEFF]+/g;
    const errors: ValidationError[] = [];

    for (const marker of context.markers) {
        const text = context.normalizedResponse.slice(marker.translationStart, marker.translationEnd);
        let longestMatch: RegExpMatchArray | undefined;
        for (const match of text.matchAll(arabicPattern)) {
            const matchText = match[0].replace(/ﷺ/g, '').trim();
            if (!matchText) {
                continue;
            }
            if (!longestMatch || matchText.length > longestMatch[0].replace(/ﷺ/g, '').trim().length) {
                longestMatch = match;
            }
        }
        if (!longestMatch) {
            continue;
        }
        const matchText = longestMatch[0].replace(/ﷺ/g, '').trim();
        const idx = longestMatch.index ?? 0;
        const normalizedStart = marker.translationStart + idx;
        const normalizedEnd = normalizedStart + longestMatch[0].length;
        errors.push(
            makeErrorFromNormalized(
                context,
                'arabic_leak',
                `Arabic script detected: "${matchText}"`,
                matchText,
                normalizedStart,
                normalizedEnd,
                marker.id,
            ),
        );
    }

    return errors;
};

/**
 * Detect excessive empty parentheses "()" which often indicates failed transliterations.
 *
 * @example
 * // Fail: too many "()"
 * validateEmptyParentheses('() () () ()')[0]?.type === 'empty_parentheses'
 */
const validateEmptyParentheses = (context: ValidationContext): ValidationError[] => {
    const matches = [...context.normalizedResponse.matchAll(/\(\)/g)];
    if (matches.length <= MAX_EMPTY_PARENTHESES) {
        return [];
    }
    return matches.map((match) => {
        const idx = match.index ?? 0;
        return makeErrorFromNormalized(
            context,
            'empty_parentheses',
            `Found ${matches.length} empty parentheses "()" - this usually indicates failed transliterations. Please check if the LLM omitted Arabic/transliterated terms.`,
            match[0],
            idx,
            idx + match[0].length,
        );
    });
};

/**
 * Detect truncated translation vs Arabic source (ratio-based).
 *
 * @example
 * // Fail: long Arabic + very short translation
 * detectTruncatedTranslation('نص عربي طويل ... (50+ chars)', 'Short') !== undefined
 */
const detectTruncatedTranslation = (arabicText: string, translationText: string) => {
    const arabic = (arabicText || '').trim();
    const translation = (translationText || '').trim();

    if (arabic.length < MIN_ARABIC_LENGTH_FOR_TRUNCATION_CHECK) {
        return;
    }
    if (translation.length === 0) {
        return `Translation appears empty but Arabic text has ${arabic.length} characters`;
    }

    const ratio = translation.length / arabic.length;
    if (ratio < MIN_TRANSLATION_RATIO) {
        const expectedMinLength = Math.round(arabic.length * MIN_TRANSLATION_RATIO);
        return `Translation appears truncated: ${translation.length} chars for ${arabic.length} char Arabic text (expected at least ~${expectedMinLength} chars)`;
    }
};

/**
 * Validate per-ID translation lengths (response subset only).
 *
 * @example
 * // Produces a length_mismatch error for the first truncated segment found
 */
const validateTranslationLengthsForResponse = (context: ValidationContext): ValidationError[] => {
    const errors: ValidationError[] = [];
    for (const marker of context.markers) {
        const seg = context.segmentById.get(marker.id);
        if (!seg) {
            continue;
        }
        const translation = context.normalizedResponse.slice(marker.translationStart, marker.translationEnd).trim();
        const error = detectTruncatedTranslation(seg.text, translation);
        if (error) {
            errors.push(
                makeErrorFromRawRange(
                    'length_mismatch',
                    `Translation for "${marker.id}" ${error.replace('Translation ', '').toLowerCase()}`,
                    translation,
                    { end: marker.rawTranslationEnd, start: marker.rawTranslationStart },
                    marker.id,
                ),
            );
        }
    }
    return errors;
};

/**
 * Detect “shouting” ALL CAPS words.
 *
 * @example
 * validateAllCaps('THIS IS LOUD')[0]?.type === 'all_caps'
 */
const validateAllCaps = (context: ValidationContext): ValidationError[] => {
    const errors: ValidationError[] = [];
    const runThreshold = context.config.allCapsWordRunThreshold;
    const runPattern = new RegExp(`\\b(?:[A-Z]{2,}\\b\\s+){${runThreshold - 1}}[A-Z]{2,}\\b`, 'g');
    for (const match of context.normalizedResponse.matchAll(runPattern)) {
        const matchText = match[0];
        const idx = match.index ?? 0;
        errors.push(
            makeErrorFromNormalized(
                context,
                'all_caps',
                `ALL CAPS detected: "${matchText.trim()}"`,
                matchText,
                idx,
                idx + matchText.length,
            ),
        );
    }
    return errors;
};

/**
 * Detect multi-word transliteration patterns without immediate parenthetical gloss.
 *
 * @example
 * // Fail: "al-hajr fi al-madajīʿ" without "(English ...)" nearby
 * // => multiword_translit_without_gloss
 */
const validateMultiwordTranslitWithoutGloss = (context: ValidationContext): ValidationError[] => {
    const errors: ValidationError[] = [];
    const phrasePattern = /\b(al-[a-zʿʾāīūḥṣḍṭẓ-]+)\s+fi\s+(al-[a-zʿʾāīūḥṣḍṭẓ-]+)\b/gi;

    for (const marker of context.markers) {
        const text = context.normalizedResponse.slice(marker.translationStart, marker.translationEnd);
        if (!text) {
            continue;
        }

        for (const m of text.matchAll(phrasePattern)) {
            const phrase = `${m[1]} fi ${m[2]}`;
            const idx = m.index ?? -1;
            if (idx >= 0) {
                const after = text.slice(idx, Math.min(text.length, idx + phrase.length + 25));
                if (!after.includes('(')) {
                    const normalizedStart = marker.translationStart + idx;
                    const normalizedEnd = normalizedStart + phrase.length;
                    errors.push(
                        makeErrorFromNormalized(
                            context,
                            'multiword_translit_without_gloss',
                            `Multi-word transliteration without immediate gloss in "${marker.id}": "${phrase}"`,
                            phrase,
                            normalizedStart,
                            normalizedEnd,
                            marker.id,
                        ),
                    );
                }
            }
        }
    }

    return errors;
};

const DEFAULT_RULE_DEFS: ReadonlyArray<{
    id: ValidationErrorType;
    run: (context: ValidationContext) => ValidationError[];
}> = [
    { id: 'invalid_marker_format', run: validateMarkerFormat },
    { id: 'newline_after_id', run: validateNewlineAfterId },
    { id: 'truncated_segment', run: validateTruncatedSegments },
    { id: 'arabic_leak', run: validateArabicLeak },
    { id: 'empty_parentheses', run: validateEmptyParentheses },
    { id: 'length_mismatch', run: validateTranslationLengthsForResponse },
    { id: 'all_caps', run: validateAllCaps },
    { id: 'multiword_translit_without_gloss', run: validateMultiwordTranslitWithoutGloss },
];

const DEFAULT_RULES: ValidationRule[] = DEFAULT_RULE_DEFS.map((rule) => ({ ...rule, type: rule.id }));

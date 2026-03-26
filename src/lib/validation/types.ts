/**
 * A single segment (Arabic source excerpt) identified by an ID.
 *
 * Canonical shape (breaking change): `{ id, text }`.
 *
 * @example
 * const seg: Segment = { id: 'P1', text: 'نص عربي...' };
 */
export type Segment = { id: string; text: string };

/**
 * Machine-readable error types emitted by the validator.
 * Keep these stable: clients may map them to UI severities.
 */
export type ValidationErrorType =
    | 'invalid_marker_format'
    | 'no_valid_markers'
    | 'newline_after_id'
    | 'duplicate_id'
    | 'invented_id'
    | 'missing_id_gap'
    | 'collapsed_speakers'
    | 'truncated_segment'
    | 'arabic_leak'
    | 'empty_parentheses'
    | 'length_mismatch'
    | 'all_caps'
    | 'multiword_translit_without_gloss';

/**
 * A character index range in a string. End is exclusive.
 */
export type Range = { start: number; end: number };

export type TranslationMarker = {
    id: string;
    headerText: string;
    normalizedStart: number;
    normalizedEnd: number;
    rawStart: number;
    rawEnd: number;
    translationStart: number;
    translationEnd: number;
    rawTranslationStart: number;
    rawTranslationEnd: number;
};

export type ValidationContext = {
    rawResponse: string;
    normalizedResponse: string;
    indexMap: number[];
    parsedIds: string[];
    segments: Segment[];
    segmentById: Map<string, Segment>;
    responseById: Map<string, string>;
    markers: TranslationMarker[];
    config: ValidationConfig;
};

/**
 * A single validation error.
 */
export type ValidationError = {
    type: ValidationErrorType;
    message: string;
    range: Range;
    segmentRange?: Range;
    matchText: string;
    id?: string;
    /**
     * Stable rule identifier for tooling/triage; may be more specific than type.
     */
    ruleId?: string;
};

export type ValidationRule = {
    id: string;
    type: ValidationErrorType;
    run: (context: ValidationContext) => ValidationError[];
};

export type ValidationConfig = { allCapsWordRunThreshold: number };

/**
 * Configuration for fixer helpers that repair common LLM formatting mistakes.
 */
export type FixConfig = {
    /**
     * Speaker labels to recognize when fixing collapsed speaker lines.
     * Example: ["Questioner", "The Shaykh", "Mu'adhdhin"]
     */
    speakerLabels?: string[];
    /**
     * Punctuation tokens that may appear before a collapsed speaker label.
     * These are used to detect " ... The Shaykh:" and similar patterns.
     */
    leadingPunctuation?: string[];
};

export type FixResult = {
    text: string;
    applied: string[];
    requested?: string[];
    skipped?: string[];
    counts: Record<string, number>;
};

export type FixAllOptions = { types: ValidationErrorType[]; config?: FixConfig };

/**
 * Result of validating an LLM translation response against a set of source segments.
 */
export type ValidationResponseResult = { normalizedResponse: string; parsedIds: string[]; errors: ValidationError[] };

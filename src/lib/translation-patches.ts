import { applyPatch, diffChars } from 'diff';

import { parseTranslationsInOrder } from './validation/textUtils';
import type { Range, Segment } from './validation/types';

export type RupturePatchOp = { end: number; start: number; text: string };
export type RupturePatch = { ops: RupturePatchOp[] };
export type RupturePatches = Record<string, RupturePatch>;
export type RuptureHighlight = { range: Range; title?: string };
export type RupturePatchMetadata = {
    appliedAt: string;
    highlights?: RuptureHighlight[];
    highlightRanges?: Range[];
    source: {
        kind: 'llm';
        model: string;
        modelVersion?: string;
        provider: 'cloudflare' | 'google' | 'huggingface' | 'openrouter';
        task: 'arabic_leak_correction';
    };
};
export type RupturePatchMetadataMap = Record<string, RupturePatchMetadata>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isRupturePatchOp = (value: unknown): value is RupturePatchOp => {
    if (!isRecord(value)) {
        return false;
    }

    const start = value.start;
    const end = value.end;
    const text = value.text;

    if (typeof start !== 'number' || typeof end !== 'number' || typeof text !== 'string') {
        return false;
    }

    return Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end >= start;
};

export const isRupturePatch = (value: unknown): value is RupturePatch =>
    isRecord(value) && Array.isArray(value.ops) && value.ops.every(isRupturePatchOp);

export const isRupturePatchMetadata = (value: unknown): value is RupturePatchMetadata => {
    if (!isRecord(value) || !isRecord(value.source)) {
        return false;
    }

    const highlights = value.highlights;
    const highlightRanges = value.highlightRanges;

    return (
        typeof value.appliedAt === 'string' &&
        (typeof highlights === 'undefined' ||
            (Array.isArray(highlights) &&
                highlights.every(
                    (highlight) =>
                        isRecord(highlight) &&
                        isRecord(highlight.range) &&
                        typeof highlight.range.start === 'number' &&
                        typeof highlight.range.end === 'number' &&
                        Number.isInteger(highlight.range.start) &&
                        Number.isInteger(highlight.range.end) &&
                        highlight.range.start >= 0 &&
                        highlight.range.end >= highlight.range.start &&
                        (typeof highlight.title === 'string' || typeof highlight.title === 'undefined'),
                ))) &&
        (typeof highlightRanges === 'undefined' ||
            (Array.isArray(highlightRanges) &&
                highlightRanges.every(
                    (range) =>
                        isRecord(range) &&
                        typeof range.start === 'number' &&
                        typeof range.end === 'number' &&
                        Number.isInteger(range.start) &&
                        Number.isInteger(range.end) &&
                        range.start >= 0 &&
                        range.end >= range.start,
                ))) &&
        value.source.kind === 'llm' &&
        typeof value.source.model === 'string' &&
        (value.source.provider === 'cloudflare' ||
            value.source.provider === 'google' ||
            value.source.provider === 'huggingface' ||
            value.source.provider === 'openrouter') &&
        value.source.task === 'arabic_leak_correction' &&
        (typeof value.source.modelVersion === 'string' || typeof value.source.modelVersion === 'undefined')
    );
};

const normalizeRupturePatch = (patch: RupturePatch): RupturePatch | null => {
    const ops = patch.ops.toSorted((left, right) => left.start - right.start || left.end - right.end);

    for (let index = 0; index < ops.length; index += 1) {
        const current = ops[index];
        const previous = ops[index - 1];

        if (!current) {
            return null;
        }

        if (previous && current.start < previous.end) {
            return null;
        }
    }

    return ops.length > 0 ? { ops } : null;
};

const applyRupturePatch = (text: string, patch: RupturePatch) => {
    const normalizedPatch = normalizeRupturePatch(patch);
    if (!normalizedPatch) {
        return null;
    }

    let cursor = 0;
    let result = '';

    for (const op of normalizedPatch.ops) {
        if (op.start < cursor || op.start > text.length || op.end < op.start || op.end > text.length) {
            return null;
        }

        result += text.slice(cursor, op.start);
        result += op.text;
        cursor = op.end;
    }

    result += text.slice(cursor);
    return result;
};

const coerceLegacyRupturePatch = (text: string, legacyPatch: string) => {
    const nextText = applyPatch(text, legacyPatch);
    return nextText === false ? null : createRupturePatch(text, nextText);
};

const coerceRupturePatch = (text: string, patch: unknown) => {
    if (typeof patch === 'string') {
        return coerceLegacyRupturePatch(text, patch);
    }

    return isRupturePatch(patch) ? normalizeRupturePatch(patch) : null;
};

export const normalizeRupturePatchesForSegments = (
    segments: Segment[],
    rawPatches: unknown,
): RupturePatches | undefined => {
    if (!isRecord(rawPatches)) {
        return undefined;
    }

    const entries: Array<[string, RupturePatch]> = [];

    for (const segment of segments) {
        const patch = coerceRupturePatch(segment.text, rawPatches[segment.id]);
        if (patch) {
            entries.push([segment.id, patch]);
        }
    }

    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

export const getRuptureHighlightsFromMetadata = (metadata?: RupturePatchMetadata | null): RuptureHighlight[] => {
    if (metadata?.highlights && metadata.highlights.length > 0) {
        return metadata.highlights;
    }

    if (metadata?.highlightRanges && metadata.highlightRanges.length > 0) {
        return metadata.highlightRanges.map((range) => ({ range }));
    }

    return [];
};

export const stripRuptureHighlightMetadata = (
    metadata?: RupturePatchMetadata | null,
): RupturePatchMetadata | undefined => {
    if (!metadata) {
        return undefined;
    }

    return { appliedAt: metadata.appliedAt, source: { ...metadata.source } };
};

export const getRupturePatchHighlightRanges = (patch: RupturePatch): Range[] => {
    const normalizedPatch = normalizeRupturePatch(patch);
    if (!normalizedPatch) {
        return [];
    }

    const ranges: Range[] = [];
    let originalCursor = 0;
    let patchedCursor = 0;

    for (const op of normalizedPatch.ops) {
        patchedCursor += op.start - originalCursor;
        originalCursor = op.end;

        if (op.text.length > 0) {
            ranges.push({ end: patchedCursor + op.text.length, start: patchedCursor });
            patchedCursor += op.text.length;
        }
    }

    return ranges;
};

export const mergeRuptureHighlightsForDisplay = (text: string, highlights: RuptureHighlight[]): RuptureHighlight[] => {
    if (highlights.length <= 1) {
        return highlights;
    }

    const sortedHighlights = highlights
        .filter((highlight) => highlight.range.start < highlight.range.end)
        .toSorted((left, right) => left.range.start - right.range.start || left.range.end - right.range.end);

    if (sortedHighlights.length <= 1) {
        return sortedHighlights;
    }

    const mergedHighlights: RuptureHighlight[] = [];
    let currentHighlight = sortedHighlights[0];

    for (let index = 1; index < sortedHighlights.length; index += 1) {
        const nextHighlight = sortedHighlights[index];
        if (!currentHighlight || !nextHighlight) {
            continue;
        }

        const gapText =
            nextHighlight.range.start > currentHighlight.range.end
                ? text.slice(currentHighlight.range.end, nextHighlight.range.start)
                : '';
        const shouldMerge =
            !currentHighlight.title &&
            !nextHighlight.title &&
            (nextHighlight.range.start <= currentHighlight.range.end || /^[ \t]+$/.test(gapText));

        if (shouldMerge) {
            currentHighlight = {
                range: {
                    end: Math.max(currentHighlight.range.end, nextHighlight.range.end),
                    start: currentHighlight.range.start,
                },
            };
            continue;
        }

        mergedHighlights.push(currentHighlight);
        currentHighlight = nextHighlight;
    }

    if (currentHighlight) {
        mergedHighlights.push(currentHighlight);
    }

    return mergedHighlights;
};

export const getRuptureDisplayHighlights = (
    text: string,
    patch?: RupturePatch | null,
    metadata?: RupturePatchMetadata | null,
): RuptureHighlight[] => {
    const metadataHighlights = getRuptureHighlightsFromMetadata(metadata);
    if (metadataHighlights.length > 0) {
        return metadataHighlights;
    }

    if (!patch) {
        return [];
    }

    return mergeRuptureHighlightsForDisplay(
        text,
        getRupturePatchHighlightRanges(patch).map((range) => ({ range })),
    );
};

export const applyRupturePatchesToSegments = (segments: Segment[], patches?: RupturePatches | null) => {
    if (!patches) {
        return segments;
    }

    const hasAnyPatch = segments.some((segment) => patches[segment.id]);
    if (!hasAnyPatch) {
        return segments;
    }

    return segments.map((segment) => {
        const patch = patches[segment.id];
        if (!patch) {
            return segment;
        }

        const patchedText = applyRupturePatch(segment.text, patch);
        return patchedText === null ? segment : { ...segment, text: patchedText };
    });
};

export const applyRupturePatchesToResponse = (response: string, patches?: RupturePatches | null) => {
    const segments = applyRupturePatchesToSegments(parseTranslationsInOrder(response), patches);
    return segments.map((segment) => `${segment.id} - ${segment.text}`).join('\n\n');
};

export const createRupturePatch = (originalText: string, nextText: string): RupturePatch | null => {
    if (originalText === nextText) {
        return null;
    }

    const ops: RupturePatchOp[] = [];
    let originalCursor = 0;
    let pendingInsertText = '';
    let pendingStart: number | null = null;
    let pendingEnd: number | null = null;

    const flushPending = () => {
        if (pendingStart === null && pendingInsertText.length === 0) {
            return;
        }

        const start = pendingStart ?? originalCursor;
        const end = pendingEnd ?? start;
        ops.push({ end, start, text: pendingInsertText });
        pendingInsertText = '';
        pendingStart = null;
        pendingEnd = null;
    };

    for (const part of diffChars(originalText, nextText)) {
        if (part.added) {
            pendingInsertText += part.value;
            continue;
        }

        if (part.removed) {
            if (pendingStart === null) {
                pendingStart = originalCursor;
            }
            originalCursor += part.value.length;
            pendingEnd = originalCursor;
            continue;
        }

        flushPending();
        originalCursor += part.value.length;
    }

    flushPending();

    return ops.length > 0 ? { ops } : null;
};

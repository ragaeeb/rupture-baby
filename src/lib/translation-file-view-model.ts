import { validateConversationExcerpts } from './translation-parser';
import {
    applyRupturePatchesToResponse,
    applyRupturePatchesToSegments,
    createRupturePatch,
    getRupturePatchHighlightRanges,
    normalizeRupturePatchesForSegments,
    type RupturePatch,
    type RupturePatches,
} from './translation-patches';
import type { CommonConversationExport } from './translation-types';
import { parseTranslationsInOrder } from './validation/textUtils';
import type { Range, ValidationError } from './validation/types';

export type FileViewMode = 'table' | 'json' | 'normal';

export type PendingEdit = { patch: RupturePatch };

export type PendingEditMap = Record<string, PendingEdit>;

export type TranslationRowData = {
    arabic: string;
    baseTranslatedText: string;
    highlightRanges: Range[];
    id: string;
    isDirty: boolean;
    hasPatch: boolean;
    patchHighlightRanges: Range[];
    translatedText: string;
    validationMessages: string[];
};

export type TranslationTableModel = {
    hasAlignmentErrors: boolean;
    hasPatches: boolean;
    isValid: boolean;
    patchedRowCount: number;
    responseIds: string[];
    rows: TranslationRowData[];
    sourceIds: string[];
};

const ALIGNMENT_ERROR_TYPES = new Set<ValidationError['type']>(['duplicate_id', 'invented_id', 'missing_id_gap']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

export const isFileViewMode = (value: string | null): value is FileViewMode =>
    value === 'table' || value === 'json' || value === 'normal';

export const getCommitButtonLabel = (pendingEditCount: number, isCommitting: boolean) => {
    if (isCommitting) {
        return 'Committing...';
    }
    if (pendingEditCount > 0) {
        return `Commit (${pendingEditCount})`;
    }
    return 'Commit';
};

export const mergePersistedRuptureMeta = (currentContent: unknown, persistedContent: unknown) => {
    if (!isRecord(currentContent) || !isRecord(persistedContent)) {
        return persistedContent;
    }

    const nextContent = { ...currentContent };
    if (isRecord(persistedContent.__rupture)) {
        nextContent.__rupture = persistedContent.__rupture;
        return nextContent;
    }

    delete nextContent.__rupture;
    return nextContent;
};

export const mergeRupturePatches = (
    savedPatches: unknown,
    baseTranslatedSegments: ReturnType<typeof parseTranslationsInOrder>,
    pendingEdits: PendingEditMap,
): RupturePatches | undefined => {
    const pendingPatches = Object.fromEntries(
        Object.entries(pendingEdits).map(([excerptId, pendingEdit]) => [excerptId, pendingEdit.patch]),
    );
    const merged = {
        ...(typeof savedPatches === 'object' && savedPatches !== null && !Array.isArray(savedPatches)
            ? (savedPatches as Record<string, unknown>)
            : {}),
        ...pendingPatches,
    };

    return normalizeRupturePatchesForSegments(baseTranslatedSegments, merged);
};

export const buildPatchedConversation = (
    conversation: CommonConversationExport | null,
    pendingEdits: PendingEditMap,
) => {
    if (!conversation) {
        return null;
    }

    const baseTranslatedSegments = parseTranslationsInOrder(conversation.response);
    const patches = mergeRupturePatches(conversation.__rupture?.patches, baseTranslatedSegments, pendingEdits);
    if (!patches) {
        return conversation;
    }

    return {
        ...conversation,
        __rupture: { ...(conversation.__rupture ?? {}), patches },
        response: applyRupturePatchesToResponse(conversation.response, patches),
    };
};

export const updatePendingEdits = (
    currentEdits: PendingEditMap,
    excerptId: string,
    originalText: string,
    nextText: string,
): PendingEditMap => {
    if (originalText === nextText) {
        if (!(excerptId in currentEdits)) {
            return currentEdits;
        }

        const nextEdits = { ...currentEdits };
        delete nextEdits[excerptId];
        return nextEdits;
    }

    const patch = createRupturePatch(originalText, nextText);
    if (!patch) {
        return currentEdits;
    }

    return { ...currentEdits, [excerptId]: { patch } };
};

export const buildTranslationTableModel = (
    conversation: CommonConversationExport | null,
    pendingEdits: PendingEditMap,
): TranslationTableModel | null => {
    if (!conversation) {
        return null;
    }

    const baseTranslatedSegments = parseTranslationsInOrder(conversation.response);
    const mergedPatches = mergeRupturePatches(conversation.__rupture?.patches, baseTranslatedSegments, pendingEdits);
    const translatedSegments = applyRupturePatchesToSegments(baseTranslatedSegments, mergedPatches);
    const patchedResponse = translatedSegments.map((segment) => `${segment.id} - ${segment.text}`).join('\n\n');
    const validation = validateConversationExcerpts({ ...conversation, response: patchedResponse });
    const { arabicSegments, excerpts, validationErrors } = validation;
    const baseTranslatedById = new Map(baseTranslatedSegments.map((segment) => [segment.id, segment.text] as const));
    const translatedById = new Map(translatedSegments.map((segment) => [segment.id, segment.text] as const));
    const errorsById = new Map<string, ValidationError[]>();
    const patchesById = mergedPatches ?? {};

    for (const error of validationErrors) {
        if (!error.id) {
            continue;
        }

        const existing = errorsById.get(error.id) ?? [];
        existing.push(error);
        errorsById.set(error.id, existing);
    }

    const rows = arabicSegments.map((segment, index): TranslationRowData => {
        const excerpt = excerpts[index];
        const rowErrors = errorsById.get(segment.id) ?? [];
        const translatedText = excerpt?.text ?? translatedById.get(segment.id) ?? '';
        const patch = patchesById[segment.id];

        return {
            arabic: segment.text,
            baseTranslatedText: baseTranslatedById.get(segment.id) ?? '',
            hasPatch: Boolean(patch),
            highlightRanges: rowErrors.flatMap((error) => (error.segmentRange ? [error.segmentRange] : [])),
            id: segment.id,
            isDirty: segment.id in pendingEdits,
            patchHighlightRanges: patch ? getRupturePatchHighlightRanges(patch) : [],
            translatedText,
            validationMessages: rowErrors.map((error) => error.message),
        };
    });

    return {
        hasAlignmentErrors: validationErrors.some((error) => ALIGNMENT_ERROR_TYPES.has(error.type)),
        hasPatches: rows.some((row) => row.hasPatch),
        isValid: validationErrors.length === 0,
        patchedRowCount: rows.filter((row) => row.hasPatch).length,
        responseIds: translatedSegments.map((segment) => segment.id),
        rows,
        sourceIds: arabicSegments.map((segment) => segment.id),
    };
};

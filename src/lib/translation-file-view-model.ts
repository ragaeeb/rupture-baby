import { applyArabicLeakCorrectionsToText } from './arabic-leak-corrections';
import type { ArabicLeakCorrection, ArabicLeakCorrectionExcerpt } from './shell-types';
import { validateConversationExcerpts } from './translation-parser';
import {
    applyRupturePatchesToResponse,
    applyRupturePatchesToSegments,
    createRupturePatch,
    getRuptureHighlightsFromMetadata,
    getRupturePatchHighlightRanges,
    normalizeRupturePatchesForSegments,
    type RuptureHighlight,
    type RupturePatch,
    type RupturePatches,
    type RupturePatchMetadata,
} from './translation-patches';
import type { CommonConversationExport } from './translation-types';
import { parseTranslationsInOrder } from './validation/textUtils';
import type { Range, ValidationError } from './validation/types';

export type FileViewMode = 'table' | 'json' | 'normal';

export type PendingEdit = { metadata?: RupturePatchMetadata; patch: RupturePatch };

export type PendingEditMap = Record<string, PendingEdit>;

export type TranslationRowData = {
    arabic: string;
    baseTranslatedText: string;
    highlightRanges: Range[];
    id: string;
    isDirty: boolean;
    hasPatch: boolean;
    patchHighlights: RuptureHighlight[];
    translatedText: string;
    validationMessages: string[];
};

export type TranslationTableModel = {
    arabicLeakExcerpts: ArabicLeakCorrectionExcerpt[];
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

const mergeRupturePatchMetadata = (
    savedPatchMetadata: unknown,
    pendingEdits: PendingEditMap,
): Record<string, RupturePatchMetadata> => {
    const mergedPatchMetadata: Record<string, RupturePatchMetadata> = {};

    if (isRecord(savedPatchMetadata)) {
        for (const [excerptId, metadata] of Object.entries(savedPatchMetadata)) {
            if (
                isRecord(metadata) &&
                typeof metadata.appliedAt === 'string' &&
                isRecord(metadata.source) &&
                metadata.source.kind === 'llm' &&
                typeof metadata.source.model === 'string' &&
                (metadata.source.provider === 'cloudflare' ||
                    metadata.source.provider === 'google' ||
                    metadata.source.provider === 'huggingface' ||
                    metadata.source.provider === 'openrouter') &&
                metadata.source.task === 'arabic_leak_correction'
            ) {
                mergedPatchMetadata[excerptId] = metadata as RupturePatchMetadata;
            }
        }
    }

    for (const [excerptId, pendingEdit] of Object.entries(pendingEdits)) {
        if (pendingEdit.metadata) {
            mergedPatchMetadata[excerptId] = pendingEdit.metadata;
        } else {
            delete mergedPatchMetadata[excerptId];
        }
    }

    return mergedPatchMetadata;
};

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
    metadata?: RupturePatchMetadata,
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

    return { ...currentEdits, [excerptId]: metadata ? { metadata, patch } : { patch } };
};

export const buildTranslationTableModel = (
    conversation: CommonConversationExport | null,
    pendingEdits: PendingEditMap,
    filePath?: string,
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
    const patchMetadataById = mergeRupturePatchMetadata(conversation.__rupture?.patchMetadata, pendingEdits);

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
        const patchMetadata = patchMetadataById[segment.id];

        return {
            arabic: segment.text,
            baseTranslatedText: baseTranslatedById.get(segment.id) ?? '',
            hasPatch: Boolean(patch),
            highlightRanges: rowErrors.flatMap((error) => (error.segmentRange ? [error.segmentRange] : [])),
            id: segment.id,
            isDirty: segment.id in pendingEdits,
            patchHighlights: (() => {
                const metadataHighlights = getRuptureHighlightsFromMetadata(patchMetadata);
                if (metadataHighlights.length > 0) {
                    return metadataHighlights;
                }
                return patch ? getRupturePatchHighlightRanges(patch).map((range) => ({ range })) : [];
            })(),
            translatedText,
            validationMessages: rowErrors.map((error) => error.message),
        };
    });

    return {
        arabicLeakExcerpts: rows
            .filter((row) => errorsById.get(row.id)?.some((error) => error.type === 'arabic_leak'))
            .map((row) => ({
                arabic: row.arabic,
                filePath: filePath ?? '',
                id: row.id,
                leakHints: [
                    ...new Set(
                        (errorsById.get(row.id) ?? [])
                            .filter((error) => error.type === 'arabic_leak' && error.matchText.trim().length > 0)
                            .map((error) => error.matchText.trim()),
                    ),
                ],
                translation: row.translatedText,
            })),
        hasAlignmentErrors: validationErrors.some((error) => ALIGNMENT_ERROR_TYPES.has(error.type)),
        hasPatches: rows.some((row) => row.hasPatch),
        isValid: validationErrors.length === 0,
        patchedRowCount: rows.filter((row) => row.hasPatch).length,
        responseIds: translatedSegments.map((segment) => segment.id),
        rows,
        sourceIds: arabicSegments.map((segment) => segment.id),
    };
};

export const applyArabicLeakCorrectionsToPendingEdits = (
    model: TranslationTableModel | null,
    currentEdits: PendingEditMap,
    corrections: ArabicLeakCorrection[],
    metadata: RupturePatchMetadata,
    filePath: string,
) => {
    if (!model) {
        return { issues: ['Failed to parse conversation.'], nextEdits: currentEdits, updatedRowCount: 0 };
    }

    const rowsById = new Map(model.rows.map((row) => [row.id, row] as const));
    const leakHintsById = new Map(
        model.arabicLeakExcerpts.map((excerpt) => [excerpt.id, excerpt.leakHints ?? []] as const),
    );
    const correctionsById = new Map<string, ArabicLeakCorrection[]>();

    for (const correction of corrections) {
        const existing = correctionsById.get(correction.id) ?? [];
        existing.push(correction);
        correctionsById.set(correction.id, existing);
    }

    let nextEdits = currentEdits;
    const issues: string[] = [];
    let updatedRowCount = 0;

    for (const [excerptId, excerptCorrections] of correctionsById) {
        const row = rowsById.get(excerptId);
        if (!row) {
            issues.push(`Received a correction for unknown excerpt ${excerptId}.`);
            continue;
        }

        const fileCorrections = excerptCorrections.filter((correction) => correction.filePath === filePath);
        const replacementResult = applyArabicLeakCorrectionsToText(
            excerptId,
            row.translatedText,
            fileCorrections,
            leakHintsById.get(excerptId) ?? [],
        );
        const { issues: rowIssues, nextText, replacementHighlights: rowHighlights, rowChanged } = replacementResult;
        issues.push(...rowIssues);

        if (!rowChanged || nextText === row.translatedText) {
            continue;
        }

        nextEdits = updatePendingEdits(nextEdits, excerptId, row.baseTranslatedText, nextText, {
            ...metadata,
            highlights: rowHighlights,
        });
        updatedRowCount += 1;
    }

    return { issues, nextEdits, updatedRowCount };
};

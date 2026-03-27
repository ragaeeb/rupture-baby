import { applyArabicLeakCorrectionsToText } from './arabic-leak-corrections';
import type { InvalidExcerptRow } from './shell-types';
import { createRupturePatch, type RupturePatchMetadata } from './translation-patches';

export type InvalidPendingEdit = {
    excerptId: string;
    filePath: string;
    metadata?: RupturePatchMetadata;
    nextTranslation: string;
    patch: NonNullable<ReturnType<typeof createRupturePatch>>;
};

export type InvalidPendingEditMap = Record<string, InvalidPendingEdit>;

export const getInvalidPendingEditKey = (filePath: string, excerptId: string) => `${filePath}::${excerptId}`;

export const updateInvalidPendingEdits = (
    currentEdits: InvalidPendingEditMap,
    row: InvalidExcerptRow & { baseTranslation: string; id: string; translation: string },
    nextText: string,
) => {
    const key = getInvalidPendingEditKey(row.filePath, row.id);
    const existingEdit = currentEdits[key];

    if (row.baseTranslation === nextText) {
        if (!(key in currentEdits)) {
            return currentEdits;
        }

        const nextEdits = { ...currentEdits };
        delete nextEdits[key];
        return nextEdits;
    }

    const patch = createRupturePatch(row.baseTranslation, nextText);
    if (!patch) {
        return currentEdits;
    }

    return {
        ...currentEdits,
        [key]: {
            excerptId: row.id,
            filePath: row.filePath,
            metadata: existingEdit?.metadata,
            nextTranslation: nextText,
            patch,
        },
    };
};

export const applyArabicLeakCorrectionsToInvalidRows = (
    rows: InvalidExcerptRow[],
    currentEdits: InvalidPendingEditMap,
    corrections: Array<{ filePath: string; id: string; match: string; replacement: string }>,
    metadata: RupturePatchMetadata,
) => {
    const rowsByKey = new Map(
        rows
            .filter(
                (
                    row,
                ): row is InvalidExcerptRow & {
                    arabic: string;
                    baseTranslation: string;
                    id: string;
                    translation: string;
                } => Boolean(row.id && row.arabic && row.baseTranslation && row.translation),
            )
            .map((row) => [getInvalidPendingEditKey(row.filePath, row.id), row] as const),
    );
    const correctionsByKey = new Map<string, typeof corrections>();

    for (const correction of corrections) {
        const key = getInvalidPendingEditKey(correction.filePath, correction.id);
        const existing = correctionsByKey.get(key) ?? [];
        existing.push(correction);
        correctionsByKey.set(key, existing);
    }

    const nextEdits = { ...currentEdits };
    const issues: string[] = [];
    let updatedRowCount = 0;

    for (const [key, rowCorrections] of correctionsByKey) {
        const row = rowsByKey.get(key);
        if (!row?.id || !row.translation || !row.baseTranslation) {
            issues.push(`Received a correction for unknown excerpt ${key}.`);
            continue;
        }

        const replacementResult = applyArabicLeakCorrectionsToText(
            row.id,
            row.translation,
            rowCorrections,
            row.arabicLeakHints,
        );
        issues.push(...replacementResult.issues);

        if (!replacementResult.rowChanged || replacementResult.nextText === row.translation) {
            continue;
        }

        const patch = createRupturePatch(row.baseTranslation, replacementResult.nextText);
        if (!patch) {
            continue;
        }

        nextEdits[key] = {
            excerptId: row.id,
            filePath: row.filePath,
            metadata: { ...metadata, highlights: replacementResult.replacementHighlights },
            nextTranslation: replacementResult.nextText,
            patch,
        };
        updatedRowCount += 1;
    }

    return { issues, nextEdits, updatedRowCount };
};

import { applyAllCapsCorrectionsToText } from './all-caps-corrections';
import { applyArabicLeakCorrectionsToText } from './arabic-leak-corrections';
import type { AllCapsCorrection, ArabicLeakCorrection, InvalidExcerptRow } from './shell-types';
import { createRupturePatch, type RupturePatchMetadata, stripRuptureHighlightMetadata } from './translation-patches';

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
            metadata: stripRuptureHighlightMetadata(existingEdit?.metadata),
            nextTranslation: nextText,
            patch,
        },
    };
};

export const commitInvalidPendingEdits = async ({
    commitPatch,
    invalidate,
    pendingEdits,
}: {
    commitPatch: (pendingEdit: InvalidPendingEdit) => Promise<unknown>;
    invalidate: () => Promise<void>;
    pendingEdits: InvalidPendingEditMap;
}) => {
    const committedRowKeys = Object.values(pendingEdits).map((pendingEdit) =>
        getInvalidPendingEditKey(pendingEdit.filePath, pendingEdit.excerptId),
    );

    for (const pendingEdit of Object.values(pendingEdits)) {
        await commitPatch(pendingEdit);
    }

    await invalidate();
    return committedRowKeys;
};

export const applyArabicLeakCorrectionsToInvalidRows = (
    rows: InvalidExcerptRow[],
    currentEdits: InvalidPendingEditMap,
    corrections: Array<{ filePath: string; id: string; match: string; replacement: string }>,
    metadata?: RupturePatchMetadata,
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

        const currentText = currentEdits[key]?.nextTranslation ?? row.translation;

        const replacementResult = applyArabicLeakCorrectionsToText(
            row.id,
            currentText,
            rowCorrections,
            row.arabicLeakHints,
        );
        issues.push(...replacementResult.issues);

        if (!replacementResult.rowChanged || replacementResult.nextText === currentText) {
            continue;
        }

        const patch = createRupturePatch(row.baseTranslation, replacementResult.nextText);
        if (!patch) {
            continue;
        }

        nextEdits[key] = {
            excerptId: row.id,
            filePath: row.filePath,
            metadata: metadata ? { ...metadata, highlights: replacementResult.replacementHighlights } : undefined,
            nextTranslation: replacementResult.nextText,
            patch,
        };
        updatedRowCount += 1;
    }

    return { issues, nextEdits, updatedRowCount };
};

export const applyAllCapsCorrectionsToInvalidRows = (
    rows: InvalidExcerptRow[],
    currentEdits: InvalidPendingEditMap,
    corrections: AllCapsCorrection[],
    metadata?: RupturePatchMetadata,
) => {
    const rowsByKey = new Map(
        rows
            .filter(
                (
                    row,
                ): row is InvalidExcerptRow & {
                    allCapsHints: string[];
                    baseTranslation: string;
                    id: string;
                    translation: string;
                } => Boolean(row.id && row.baseTranslation && row.translation),
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

        const currentText = currentEdits[key]?.nextTranslation ?? row.translation;
        const replacementResult = applyAllCapsCorrectionsToText(row.id, currentText, rowCorrections, row.allCapsHints);
        issues.push(...replacementResult.issues);

        if (!replacementResult.rowChanged || replacementResult.nextText === currentText) {
            continue;
        }

        const patch = createRupturePatch(row.baseTranslation, replacementResult.nextText);
        if (!patch) {
            continue;
        }

        nextEdits[key] = {
            excerptId: row.id,
            filePath: row.filePath,
            metadata: metadata ? { ...metadata, highlights: replacementResult.replacementHighlights } : undefined,
            nextTranslation: replacementResult.nextText,
            patch,
        };
        updatedRowCount += 1;
    }

    return { issues, nextEdits, updatedRowCount };
};

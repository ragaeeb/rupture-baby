import '@tanstack/react-start/server-only';

import { stat } from 'node:fs/promises';
import path from 'node:path';

import { perfLog, withPerfSpan } from '@/lib/perf-log';
import { readTextFile } from '@/lib/runtime-files';
import type { InvalidExcerptRow } from '@/lib/shell-types';
import type { Excerpt } from '@/types/compilation';
import type { TranslationValidityAnalysis } from './translation-validity';
import {
    analyzeTranslationValidity,
    getPlayableTranslationExcerpts,
    getVisibleTranslationValidityErrors,
} from './translation-validity';
import type { Range, ValidationErrorType } from './validation/types';

export type TranslationFileAnalysis = {
    analysis?: TranslationValidityAnalysis;
    invalidRows: InvalidExcerptRow[];
    isValid: boolean;
    model: string | undefined;
    path: string;
    patchesApplied: number;
    playableExcerpts: Excerpt[];
    reasoningDurationSec: number | undefined;
};

type FileFingerprint = { mtimeMs: number; sizeBytes: number };
type TranslationAnalysisCacheEntry = FileFingerprint & { analysis: TranslationFileAnalysis };
type TranslationAnalysisCacheDeps = {
    buildAnalysis: (
        relativePath: string,
        content: string,
    ) => Promise<TranslationFileAnalysis> | TranslationFileAnalysis;
    getFileFingerprint: (fullPath: string) => Promise<FileFingerprint>;
    loadContent: (fullPath: string) => Promise<string>;
};

const DEFAULT_ANALYSIS_CONCURRENCY = 8;
type InvalidErrorBucket = {
    allCapsHints: string[];
    leakHints: string[];
    messages: string[];
    types: ValidationErrorType[];
    validationHighlightRanges: Range[];
};

const mapWithConcurrency = async <T, R>(
    values: T[],
    concurrency: number,
    mapValue: (value: T, index: number) => Promise<R>,
): Promise<R[]> => {
    if (values.length === 0) {
        return [];
    }

    const nextIndex = { current: 0 };
    const results = new Array<R>(values.length);
    const workerCount = Math.max(1, Math.min(concurrency, values.length));

    const worker = async () => {
        while (true) {
            const currentIndex = nextIndex.current;
            nextIndex.current += 1;
            if (currentIndex >= values.length) {
                return;
            }

            results[currentIndex] = await mapValue(values[currentIndex], currentIndex);
        }
    };

    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results;
};

const createInvalidErrorBucket = (): InvalidErrorBucket => ({
    allCapsHints: [],
    leakHints: [],
    messages: [],
    types: [],
    validationHighlightRanges: [],
});

const appendValidationError = (
    errorBucket: InvalidErrorBucket,
    error: TranslationValidityAnalysis['validation']['validationErrors'][number],
) => {
    errorBucket.messages.push(error.message);
    errorBucket.types.push(error.type);

    if (error.type === 'arabic_leak' && error.matchText.trim().length > 0) {
        errorBucket.leakHints.push(error.matchText.trim());
    }

    if (error.type === 'all_caps' && error.matchText.trim().length > 0) {
        errorBucket.allCapsHints.push(error.matchText.trim());
    }

    if (error.segmentRange) {
        errorBucket.validationHighlightRanges.push(error.segmentRange);
    }
};

const buildInvalidRow = ({
    arabic,
    baseTranslation,
    errorBucket,
    filePath,
    id,
    model,
    translation,
}: {
    arabic: string | null;
    baseTranslation: string | null;
    errorBucket: InvalidErrorBucket;
    filePath: string;
    id: string | null;
    model: string | undefined;
    translation: string | null;
}): InvalidExcerptRow => ({
    allCapsHints: [...new Set(errorBucket.allCapsHints)],
    arabic,
    arabicLeakHints: [...new Set(errorBucket.leakHints)],
    baseTranslation,
    errorTypes: [...new Set(errorBucket.types)],
    filePath,
    id,
    messages: errorBucket.messages,
    model,
    patchHighlights: [],
    translation,
    validationHighlightRanges: errorBucket.validationHighlightRanges,
});

const buildInvalidExcerptRowsFromAnalysis = (
    filePath: string,
    analysis: TranslationValidityAnalysis,
): InvalidExcerptRow[] => {
    const { baseTranslatedById, model, translatedById, validation } = analysis;
    const visibleValidationErrors = getVisibleTranslationValidityErrors(analysis);

    if (visibleValidationErrors.length === 0) {
        return [];
    }

    const errorsById = new Map<string, InvalidErrorBucket>();
    const globalErrorBucket: { messages: string[]; types: ValidationErrorType[] } = { messages: [], types: [] };

    for (const error of visibleValidationErrors) {
        if (error.id) {
            const existing = errorsById.get(error.id) ?? createInvalidErrorBucket();
            appendValidationError(existing, error);
            errorsById.set(error.id, existing);
            continue;
        }

        globalErrorBucket.messages.push(error.message);
        globalErrorBucket.types.push(error.type);
    }

    const excerptRows: InvalidExcerptRow[] = validation.arabicSegments.flatMap((segment) => {
        const errorBucket = errorsById.get(segment.id);
        if (!errorBucket || errorBucket.messages.length === 0) {
            return [];
        }

        return [
            buildInvalidRow({
                arabic: segment.text,
                baseTranslation: baseTranslatedById.get(segment.id) ?? null,
                errorBucket,
                filePath,
                id: segment.id,
                model,
                translation: translatedById.get(segment.id) ?? null,
            }),
        ];
    });

    const matchedSegmentIds = new Set(validation.arabicSegments.map((segment) => segment.id));
    const unmatchedIdRows: InvalidExcerptRow[] = [...errorsById.entries()].flatMap(([id, errorBucket]) => {
        if (matchedSegmentIds.has(id) || errorBucket.messages.length === 0) {
            return [];
        }

        return [
            buildInvalidRow({
                arabic: null,
                baseTranslation: baseTranslatedById.get(id) ?? translatedById.get(id) ?? null,
                errorBucket,
                filePath,
                id,
                model,
                translation: translatedById.get(id) ?? null,
            }),
        ];
    });

    if (globalErrorBucket.messages.length === 0) {
        return [...excerptRows, ...unmatchedIdRows];
    }

    return [
        ...excerptRows,
        ...unmatchedIdRows,
        {
            allCapsHints: [],
            arabic: null,
            arabicLeakHints: [],
            baseTranslation: null,
            errorTypes: [...new Set(globalErrorBucket.types)],
            filePath,
            id: null,
            messages: globalErrorBucket.messages,
            model,
            patchHighlights: [],
            translation: null,
            validationHighlightRanges: [],
        },
    ];
};

const createFileErrorAnalysis = (relativePath: string, error: unknown): TranslationFileAnalysis => ({
    invalidRows: [
        {
            allCapsHints: [],
            arabic: null,
            arabicLeakHints: [],
            baseTranslation: null,
            errorTypes: ['file_error'],
            filePath: relativePath,
            id: null,
            messages: [error instanceof Error ? error.message : 'Failed to validate translation file.'],
            patchHighlights: [],
            translation: null,
            validationHighlightRanges: [],
        },
    ],
    isValid: false,
    model: undefined,
    patchesApplied: 0,
    path: relativePath,
    playableExcerpts: [],
    reasoningDurationSec: undefined,
});

const buildTranslationFileAnalysis = (relativePath: string, content: string): TranslationFileAnalysis => {
    try {
        const analysis = analyzeTranslationValidity(content);
        return {
            analysis,
            invalidRows: buildInvalidExcerptRowsFromAnalysis(relativePath, analysis),
            isValid: getVisibleTranslationValidityErrors(analysis).length === 0,
            model: analysis.model,
            patchesApplied: analysis.patchedExcerptIds.size,
            path: relativePath,
            playableExcerpts: getPlayableTranslationExcerpts(analysis),
            reasoningDurationSec: analysis.parsed.reasoning_duration_sec,
        };
    } catch (error) {
        return createFileErrorAnalysis(relativePath, error);
    }
};

export const createTranslationAnalysisCache = (
    deps: TranslationAnalysisCacheDeps = {
        buildAnalysis: buildTranslationFileAnalysis,
        getFileFingerprint: async (fullPath) => {
            const fileStats = await stat(fullPath);
            return { mtimeMs: fileStats.mtimeMs, sizeBytes: fileStats.size };
        },
        loadContent: readTextFile,
    },
) => {
    const cache = new Map<string, TranslationAnalysisCacheEntry>();
    const inflight = new Map<string, Promise<TranslationAnalysisCacheEntry>>();

    const getFileAnalysis = async (rootDirectory: string, relativePath: string): Promise<TranslationFileAnalysis> => {
        const fullPath = path.join(rootDirectory, relativePath);
        const fingerprint = await deps.getFileFingerprint(fullPath);
        const cachedEntry = cache.get(fullPath);

        if (
            cachedEntry &&
            cachedEntry.mtimeMs === fingerprint.mtimeMs &&
            cachedEntry.sizeBytes === fingerprint.sizeBytes
        ) {
            perfLog('translation-analysis-cache', 'cache_hit', { relativePath });
            return cachedEntry.analysis;
        }

        const inflightKey = `${fullPath}:${fingerprint.mtimeMs}:${fingerprint.sizeBytes}`;
        const existingInflight = inflight.get(inflightKey);
        if (existingInflight) {
            perfLog('translation-analysis-cache', 'await_inflight', { relativePath });
            return (await existingInflight).analysis;
        }

        perfLog('translation-analysis-cache', 'cache_miss', { relativePath });
        const loadPromise = withPerfSpan(
            'translation-analysis-cache',
            'build_file_analysis',
            async () => {
                const content = await deps.loadContent(fullPath);
                const analysis = await deps.buildAnalysis(relativePath, content);
                const cacheEntry = { ...fingerprint, analysis };
                cache.set(fullPath, cacheEntry);
                return cacheEntry;
            },
            { relativePath },
        ).finally(() => {
            inflight.delete(inflightKey);
        });

        inflight.set(inflightKey, loadPromise);
        return (await loadPromise).analysis;
    };

    const getFileAnalyses = async (
        rootDirectory: string,
        relativePaths: string[],
        concurrency: number = DEFAULT_ANALYSIS_CONCURRENCY,
    ): Promise<TranslationFileAnalysis[]> =>
        withPerfSpan(
            'translation-analysis-cache',
            'build_file_analyses',
            () =>
                mapWithConcurrency(relativePaths, concurrency, (relativePath) =>
                    getFileAnalysis(rootDirectory, relativePath),
                ),
            { concurrency, fileCount: relativePaths.length },
        );

    const invalidate = (rootDirectory?: string, relativePath?: string) => {
        if (!rootDirectory || !relativePath) {
            perfLog('translation-analysis-cache', 'invalidate_all');
            cache.clear();
            inflight.clear();
            return;
        }

        const fullPath = path.join(rootDirectory, relativePath);
        perfLog('translation-analysis-cache', 'invalidate_file', { relativePath });
        cache.delete(fullPath);
        for (const key of inflight.keys()) {
            if (key.startsWith(`${fullPath}:`)) {
                inflight.delete(key);
            }
        }
    };

    return { getFileAnalyses, getFileAnalysis, invalidate };
};

const translationAnalysisCache = createTranslationAnalysisCache();

export const getTranslationFileAnalysis = (rootDirectory: string, relativePath: string) =>
    translationAnalysisCache.getFileAnalysis(rootDirectory, relativePath);

export const getTranslationFileAnalyses = (rootDirectory: string, relativePaths: string[], concurrency?: number) =>
    translationAnalysisCache.getFileAnalyses(rootDirectory, relativePaths, concurrency);

export const invalidateTranslationFileAnalysisCache = (rootDirectory?: string, relativePath?: string) =>
    translationAnalysisCache.invalidate(rootDirectory, relativePath);

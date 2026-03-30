import '@tanstack/react-start/server-only';

import { createReadStream, promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { parser } from 'stream-json';
import pick from 'stream-json/filters/pick.js';
import streamArray from 'stream-json/streamers/stream-array.js';
import streamValues from 'stream-json/streamers/stream-values.js';

import { requireCompilationFilePath } from '@/lib/data-paths';
import type { CompilationAnalyticsResponse } from '@/lib/shell-types';
import { roundToDecimal } from '@/lib/time';
import { getTranslationModelById } from '@/lib/translation-models';
import type { Excerpt, Heading, PatchedTranslationMetadata } from '@/types/compilation';

type CollectionKey = 'excerpts' | 'footnotes' | 'headings';

type CountBucket = { total: number; translated: number; untranslated: number };

type TimelineBucket = { excerpts: number; headings: number };

type AnalyticsCache = { filePath: string; mtimeMs: number; analytics: CompilationAnalyticsResponse };
type PatchType = PatchedTranslationMetadata['type'];

type ExcerptLike = Pick<Excerpt, 'lastUpdatedAt' | 'meta' | 'text' | 'translator'>;
type HeadingLike = Pick<Heading, 'lastUpdatedAt' | 'meta' | 'text' | 'translator'>;

let analyticsCache: AnalyticsCache | null = null;
let analyticsPromise: Promise<AnalyticsCache> | null = null;

const getBunFileStream = (filePath: string): Readable | null => {
    const bunRuntime = (
        globalThis as unknown as { Bun?: { file: (target: string) => { stream: () => ReadableStream<Uint8Array> } } }
    ).Bun;

    if (!process.versions.bun || !bunRuntime?.file) {
        return null;
    }

    return Readable.fromWeb(bunRuntime.file(filePath).stream() as unknown as NodeReadableStream);
};

const getInputStream = (filePath: string): Readable => {
    const bunStream = getBunFileStream(filePath);
    if (bunStream) {
        return bunStream;
    }

    return createReadStream(filePath);
};

const isTranslated = (value: { text?: string | null }) => Boolean(value.text);
const getAlternativeTranslationCount = (value: { meta?: { alt?: unknown } }) =>
    Array.isArray(value.meta?.alt) ? value.meta.alt.length : 0;
const getPatchType = (value: { meta?: { patched?: unknown } }): PatchType | null => {
    const patchType = (value.meta?.patched as { type?: unknown } | undefined)?.type;
    return patchType === 'all_caps_correction' || patchType === 'arabic_leak_correction' ? patchType : null;
};

const trackDuplicateTranslations = (
    value: ExcerptLike | HeadingLike,
    distribution: Map<number, number>,
): { duplicateTranslationSegmentCount: number; duplicateTranslationsTotal: number } => {
    const alternativeTranslationCount = getAlternativeTranslationCount(value);
    if (alternativeTranslationCount === 0) {
        return { duplicateTranslationSegmentCount: 0, duplicateTranslationsTotal: 0 };
    }

    distribution.set(alternativeTranslationCount, (distribution.get(alternativeTranslationCount) ?? 0) + 1);

    return { duplicateTranslationSegmentCount: 1, duplicateTranslationsTotal: alternativeTranslationCount };
};

const trackPatchedTranslation = (value: ExcerptLike | HeadingLike, patchTypeCounts: Map<PatchType, number>): number => {
    const patchType = getPatchType(value);
    if (!patchType) {
        return 0;
    }

    patchTypeCounts.set(patchType, (patchTypeCounts.get(patchType) ?? 0) + 1);
    return 1;
};

const loadScalarNumber = async (filePath: string, key: 'createdAt' | 'lastUpdatedAt') => {
    const scalarStream = getInputStream(filePath)
        .pipe(parser.asStream())
        .pipe(pick.asStream({ filter: key }))
        .pipe(streamValues.asStream());

    for await (const entry of scalarStream as AsyncIterable<{ value: unknown }>) {
        if (typeof entry.value === 'number' && Number.isFinite(entry.value)) {
            return entry.value;
        }
    }

    return null;
};

const toDayKey = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10);

const formatDayLabel = (dayKey: string) =>
    new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
        new Date(`${dayKey}T00:00:00Z`),
    );

const loadCollectionAnalytics = async (
    filePath: string,
    key: CollectionKey,
): Promise<{
    duplicateAltCountDistribution: Map<number, number>;
    duplicateTranslationSegmentCount: number;
    duplicateTranslationsTotal: number;
    dailyBuckets: Map<string, TimelineBucket>;
    patchCount: number;
    patchTypeCounts: Map<PatchType, number>;
    summary: CountBucket;
    translatorCounts: Map<string, number>;
}> => {
    const summary: CountBucket = { total: 0, translated: 0, untranslated: 0 };
    const dailyBuckets = new Map<string, TimelineBucket>();
    const translatorCounts = new Map<string, number>();
    const duplicateAltCountDistribution = new Map<number, number>();
    const patchTypeCounts = new Map<PatchType, number>();
    let duplicateTranslationSegmentCount = 0;
    let duplicateTranslationsTotal = 0;
    let patchCount = 0;
    const itemStream = getInputStream(filePath)
        .pipe(parser.asStream())
        .pipe(pick.asStream({ filter: key }))
        .pipe(streamArray.asStream());

    for await (const entry of itemStream as AsyncIterable<{ value: ExcerptLike | HeadingLike }>) {
        summary.total += 1;
        const duplicateTracking = trackDuplicateTranslations(entry.value, duplicateAltCountDistribution);
        duplicateTranslationSegmentCount += duplicateTracking.duplicateTranslationSegmentCount;
        duplicateTranslationsTotal += duplicateTracking.duplicateTranslationsTotal;
        patchCount += trackPatchedTranslation(entry.value, patchTypeCounts);

        if (!isTranslated(entry.value)) {
            summary.untranslated += 1;
            continue;
        }

        summary.translated += 1;

        if (typeof entry.value.translator === 'number') {
            const translatorId = String(entry.value.translator);
            translatorCounts.set(translatorId, (translatorCounts.get(translatorId) ?? 0) + 1);
        }

        if (typeof entry.value.lastUpdatedAt === 'number' && Number.isFinite(entry.value.lastUpdatedAt)) {
            const dayKey = toDayKey(entry.value.lastUpdatedAt);
            const bucket = dailyBuckets.get(dayKey) ?? { excerpts: 0, headings: 0 };
            bucket[key === 'headings' ? 'headings' : 'excerpts'] += 1;
            dailyBuckets.set(dayKey, bucket);
        }
    }

    return {
        dailyBuckets,
        duplicateAltCountDistribution,
        duplicateTranslationSegmentCount,
        duplicateTranslationsTotal,
        patchCount,
        patchTypeCounts,
        summary,
        translatorCounts,
    };
};

const mergeBuckets = (target: Map<string, TimelineBucket>, source: Map<string, TimelineBucket>) => {
    for (const [dayKey, bucket] of source) {
        const existing = target.get(dayKey) ?? { excerpts: 0, headings: 0 };
        existing.excerpts += bucket.excerpts;
        existing.headings += bucket.headings;
        target.set(dayKey, existing);
    }
};

const mergeTranslatorCounts = (target: Map<string, number>, source: Map<string, number>) => {
    for (const [translatorId, count] of source) {
        target.set(translatorId, (target.get(translatorId) ?? 0) + count);
    }
};

const mergeNumberDistributions = (target: Map<number, number>, source: Map<number, number>) => {
    for (const [value, count] of source) {
        target.set(value, (target.get(value) ?? 0) + count);
    }
};

const mergePatchTypeCounts = (target: Map<PatchType, number>, source: Map<PatchType, number>) => {
    for (const [type, count] of source) {
        target.set(type, (target.get(type) ?? 0) + count);
    }
};

export const summarizeCompilationAnalytics = ({
    createdAt,
    dailyBuckets,
    duplicateAltCountDistribution,
    duplicateTranslationSegmentCount,
    duplicateTranslationsTotal,
    headingsSummary,
    lastUpdatedAt,
    patchCount,
    patchTypeCounts,
    excerptsSummary,
    translatorCounts,
}: {
    createdAt: number | null;
    dailyBuckets: Map<string, TimelineBucket>;
    duplicateAltCountDistribution: Map<number, number>;
    duplicateTranslationSegmentCount: number;
    duplicateTranslationsTotal: number;
    excerptsSummary: CountBucket;
    headingsSummary: CountBucket;
    lastUpdatedAt: number | null;
    patchCount: number;
    patchTypeCounts: Map<PatchType, number>;
    translatorCounts: Map<string, number>;
}): CompilationAnalyticsResponse => {
    const totalSegments = excerptsSummary.total + headingsSummary.total;
    const translatedSegments = excerptsSummary.translated + headingsSummary.translated;
    const untranslatedSegments = excerptsSummary.untranslated + headingsSummary.untranslated;

    let cumulativeTranslated = 0;
    const timeline = [...dailyBuckets.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([date, bucket]) => {
            const translated = bucket.excerpts + bucket.headings;
            cumulativeTranslated += translated;

            return {
                completionPercent:
                    totalSegments > 0 ? roundToDecimal((cumulativeTranslated / totalSegments) * 100, 1) : 0,
                cumulativeTranslated,
                date,
                excerpts: bucket.excerpts,
                headings: bucket.headings,
                label: formatDayLabel(date),
                translated,
            };
        });

    const totalTranslatorUses = [...translatorCounts.values()].reduce((sum, count) => sum + count, 0);
    const translators = [...translatorCounts.entries()]
        .sort(([leftId, leftCount], [rightId, rightCount]) => rightCount - leftCount || leftId.localeCompare(rightId))
        .map(([id, count]) => {
            const model = getTranslationModelById(id);

            return {
                count,
                id,
                label: model?.label ?? `Translator ${id}`,
                percent: totalTranslatorUses > 0 ? roundToDecimal((count / totalTranslatorUses) * 100, 1) : 0,
            };
        });

    const duplicateTranslationAltCountDistribution = [...duplicateAltCountDistribution.entries()]
        .sort(([leftAltCount], [rightAltCount]) => leftAltCount - rightAltCount)
        .map(([altCount, segments]) => ({ altCount, label: `${altCount} alt${altCount === 1 ? '' : 's'}`, segments }));
    const patchTypeDistribution = [...patchTypeCounts.entries()]
        .sort(
            ([leftType, leftCount], [rightType, rightCount]) =>
                rightCount - leftCount || leftType.localeCompare(rightType),
        )
        .map(([type, count]) => ({
            count,
            label: type === 'arabic_leak_correction' ? 'Arabic Leak' : 'All Caps',
            type,
        }));

    return {
        createdAt,
        duplicateTranslationAltCountDistribution,
        duplicateTranslationSegmentCount,
        duplicateTranslationsTotal,
        lastUpdatedAt,
        patchCount,
        patchTypeDistribution,
        timeline,
        totalSegments,
        translatedSegments,
        translators,
        uniqueTranslators: translatorCounts.size,
        untranslatedSegments,
        workDurationSeconds:
            createdAt !== null && lastUpdatedAt !== null ? Math.max(0, lastUpdatedAt - createdAt) : null,
    };
};

const loadCompilationAnalytics = async (filePath: string, mtimeMs: number): Promise<AnalyticsCache> => {
    const [createdAt, lastUpdatedAt, excerptsAnalytics, headingsAnalytics, footnotesAnalytics] = await Promise.all([
        loadScalarNumber(filePath, 'createdAt'),
        loadScalarNumber(filePath, 'lastUpdatedAt'),
        loadCollectionAnalytics(filePath, 'excerpts'),
        loadCollectionAnalytics(filePath, 'headings'),
        loadCollectionAnalytics(filePath, 'footnotes'),
    ]);

    const dailyBuckets = new Map<string, TimelineBucket>();
    mergeBuckets(dailyBuckets, excerptsAnalytics.dailyBuckets);
    mergeBuckets(dailyBuckets, headingsAnalytics.dailyBuckets);

    const translatorCounts = new Map<string, number>();
    mergeTranslatorCounts(translatorCounts, excerptsAnalytics.translatorCounts);
    mergeTranslatorCounts(translatorCounts, headingsAnalytics.translatorCounts);
    mergeTranslatorCounts(translatorCounts, footnotesAnalytics.translatorCounts);

    const duplicateAltCountDistribution = new Map<number, number>();
    mergeNumberDistributions(duplicateAltCountDistribution, excerptsAnalytics.duplicateAltCountDistribution);
    mergeNumberDistributions(duplicateAltCountDistribution, headingsAnalytics.duplicateAltCountDistribution);
    mergeNumberDistributions(duplicateAltCountDistribution, footnotesAnalytics.duplicateAltCountDistribution);
    const patchTypeCounts = new Map<PatchType, number>();
    mergePatchTypeCounts(patchTypeCounts, excerptsAnalytics.patchTypeCounts);
    mergePatchTypeCounts(patchTypeCounts, headingsAnalytics.patchTypeCounts);
    mergePatchTypeCounts(patchTypeCounts, footnotesAnalytics.patchTypeCounts);

    return {
        analytics: summarizeCompilationAnalytics({
            createdAt,
            dailyBuckets,
            duplicateAltCountDistribution,
            duplicateTranslationSegmentCount:
                excerptsAnalytics.duplicateTranslationSegmentCount +
                headingsAnalytics.duplicateTranslationSegmentCount +
                footnotesAnalytics.duplicateTranslationSegmentCount,
            duplicateTranslationsTotal:
                excerptsAnalytics.duplicateTranslationsTotal +
                headingsAnalytics.duplicateTranslationsTotal +
                footnotesAnalytics.duplicateTranslationsTotal,
            excerptsSummary: excerptsAnalytics.summary,
            headingsSummary: headingsAnalytics.summary,
            lastUpdatedAt,
            patchCount: excerptsAnalytics.patchCount + headingsAnalytics.patchCount + footnotesAnalytics.patchCount,
            patchTypeCounts,
            translatorCounts,
        }),
        filePath,
        mtimeMs,
    };
};

export const getCompilationAnalytics = async (): Promise<CompilationAnalyticsResponse> => {
    const filePath = requireCompilationFilePath();
    const fileStats = await fs.stat(filePath);

    if (analyticsCache && analyticsCache.filePath === filePath && analyticsCache.mtimeMs === fileStats.mtimeMs) {
        return analyticsCache.analytics;
    }

    if (!analyticsPromise) {
        analyticsPromise = loadCompilationAnalytics(filePath, fileStats.mtimeMs)
            .then((cache) => {
                analyticsCache = cache;
                return cache;
            })
            .finally(() => {
                analyticsPromise = null;
            });
    }

    return (await analyticsPromise).analytics;
};

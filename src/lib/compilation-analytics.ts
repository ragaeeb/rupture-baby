import '@tanstack/react-start/server-only';

import { randomUUID } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { parser } from 'stream-json';

import { requireCompilationFilePath } from '@/lib/data-paths';
import { createPerfTimer, perfLog, withPerfSpan } from '@/lib/perf-log';
import type { CompilationAnalyticsResponse } from '@/lib/shell-types';
import { roundToDecimal } from '@/lib/time';
import { getTranslationModelById } from '@/lib/translation-models';
import type { Excerpt, Heading, PatchedTranslationMetadata } from '@/types/compilation';

type CollectionKey = 'excerpts' | 'footnotes' | 'headings';
type TimelineGranularity = CompilationAnalyticsResponse['timelineGranularity'];
type CountBucket = { total: number; translated: number; untranslated: number };
type TimelineBucket = { excerpts: number; headings: number };
type AnalyticsCache = { analytics: CompilationAnalyticsResponse; filePath: string; mtimeMs: number };
type AnalyticsSnapshot = { analytics: CompilationAnalyticsResponse; sourceMtimeMs: number; version: 1 };
type PatchType = PatchedTranslationMetadata['type'];
type ExcerptLike = Pick<Excerpt, 'lastUpdatedAt' | 'meta' | 'text' | 'translator'>;
type HeadingLike = Pick<Heading, 'lastUpdatedAt' | 'meta' | 'text' | 'translator'>;
type CollectionEntry = ExcerptLike | HeadingLike;
type AnalyticsAccumulator = {
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
};
type JsonToken = { name: string; value?: string };
type JsonAssembler = { consume: (chunk: JsonToken) => unknown; current: unknown; done: boolean };
const ANALYTICS_SNAPSHOT_VERSION = 1;
const MAX_VISIBLE_TRANSLATOR_SLICES = 8;
const MS_PER_DAY = 86_400_000;
const dayLabelFormatter = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthLabelFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC', year: 'numeric' });

let analyticsCache: AnalyticsCache | null = null;
let analyticsPromise: Promise<AnalyticsCache> | null = null;

class SimpleJsonAssembler implements JsonAssembler {
    current: unknown = null;
    done = true;
    private key: string | null = null;
    private stack: Array<{ current: Record<string, unknown> | unknown[]; key: string | null }> = [];

    consume(chunk: JsonToken) {
        switch (chunk.name) {
            case 'keyValue':
                this.key = chunk.value ?? null;
                return;
            case 'startObject':
                this.startContainer({});
                return;
            case 'startArray':
                this.startContainer([]);
                return;
            case 'stringValue':
                this.saveValue(chunk.value ?? '');
                return;
            case 'numberValue': {
                const parsedNumber = parseFiniteNumber(chunk.value);
                this.saveValue(parsedNumber ?? 0);
                return;
            }
            case 'nullValue':
                this.saveValue(null);
                return;
            case 'trueValue':
                this.saveValue(true);
                return;
            case 'falseValue':
                this.saveValue(false);
                return;
            case 'endObject':
            case 'endArray':
                this.finishContainer();
                return;
        }
    }

    private startContainer(value: Record<string, unknown> | unknown[]) {
        if (this.done) {
            this.current = value;
            this.done = false;
            this.key = null;
            return;
        }

        this.stack.push({ current: this.current as Record<string, unknown> | unknown[], key: this.key });
        this.current = value;
        this.key = null;
    }

    private finishContainer() {
        if (this.stack.length === 0) {
            this.done = true;
            return;
        }

        const value = this.current;
        const parent = this.stack.pop();
        if (!parent) {
            this.done = true;
            return;
        }

        this.current = parent.current;
        this.key = parent.key;
        this.saveValue(value);
    }

    private saveValue(value: unknown) {
        if (this.done) {
            this.current = value;
            return;
        }

        if (Array.isArray(this.current)) {
            this.current.push(value);
            return;
        }

        if (this.key) {
            (this.current as Record<string, unknown>)[this.key] = value;
            this.key = null;
        }
    }
}

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

const createCountBucket = (): CountBucket => ({ total: 0, translated: 0, untranslated: 0 });

const createAnalyticsAccumulator = (): AnalyticsAccumulator => ({
    createdAt: null,
    dailyBuckets: new Map(),
    duplicateAltCountDistribution: new Map(),
    duplicateTranslationSegmentCount: 0,
    duplicateTranslationsTotal: 0,
    excerptsSummary: createCountBucket(),
    headingsSummary: createCountBucket(),
    lastUpdatedAt: null,
    patchCount: 0,
    patchTypeCounts: new Map(),
    translatorCounts: new Map(),
});

const isTranslated = (value: { text?: string | null }) => Boolean(value.text);

const getAlternativeTranslationCount = (value: { meta?: { alt?: unknown } }) =>
    Array.isArray(value.meta?.alt) ? value.meta.alt.length : 0;

const getPatchType = (value: { meta?: { patched?: unknown } }): PatchType | null => {
    const patchType = (value.meta?.patched as { type?: unknown } | undefined)?.type;
    return patchType === 'all_caps_correction' || patchType === 'arabic_leak_correction' ? patchType : null;
};

const toUtcDate = (dayKey: string) => new Date(`${dayKey}T00:00:00Z`);

const toDayKey = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10);

const formatDayLabel = (dayKey: string) => dayLabelFormatter.format(toUtcDate(dayKey));

const formatWeekLabel = (dayKey: string) => `Week of ${dayLabelFormatter.format(toUtcDate(dayKey))}`;

const formatMonthLabel = (dayKey: string) => monthLabelFormatter.format(toUtcDate(dayKey));

const getWeekStartDayKey = (dayKey: string) => {
    const date = toUtcDate(dayKey);
    const dayOffset = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - dayOffset);
    return date.toISOString().slice(0, 10);
};

const getMonthStartDayKey = (dayKey: string) => {
    const date = toUtcDate(dayKey);
    date.setUTCDate(1);
    return date.toISOString().slice(0, 10);
};

const parseFiniteNumber = (value: unknown) => {
    const numberValue =
        typeof value === 'number' ? value : typeof value === 'string' && value.trim().length > 0 ? Number(value) : NaN;

    return Number.isFinite(numberValue) ? numberValue : null;
};

const isCollectionKey = (value: string | null): value is CollectionKey =>
    value === 'excerpts' || value === 'footnotes' || value === 'headings';

const trackDuplicateTranslations = (
    value: CollectionEntry,
    distribution: Map<number, number>,
): { duplicateTranslationSegmentCount: number; duplicateTranslationsTotal: number } => {
    const alternativeTranslationCount = getAlternativeTranslationCount(value);
    if (alternativeTranslationCount === 0) {
        return { duplicateTranslationSegmentCount: 0, duplicateTranslationsTotal: 0 };
    }

    distribution.set(alternativeTranslationCount, (distribution.get(alternativeTranslationCount) ?? 0) + 1);

    return { duplicateTranslationSegmentCount: 1, duplicateTranslationsTotal: alternativeTranslationCount };
};

const trackPatchedTranslation = (value: CollectionEntry, patchTypeCounts: Map<PatchType, number>): number => {
    const patchType = getPatchType(value);
    if (!patchType) {
        return 0;
    }

    patchTypeCounts.set(patchType, (patchTypeCounts.get(patchType) ?? 0) + 1);
    return 1;
};

const trackTimelineBucket = (
    collection: CollectionKey,
    value: CollectionEntry,
    dailyBuckets: Map<string, TimelineBucket>,
) => {
    if (collection === 'footnotes') {
        return;
    }

    if (typeof value.lastUpdatedAt !== 'number' || !Number.isFinite(value.lastUpdatedAt)) {
        return;
    }

    const dayKey = toDayKey(value.lastUpdatedAt);
    const bucket = dailyBuckets.get(dayKey) ?? { excerpts: 0, headings: 0 };
    bucket[collection === 'headings' ? 'headings' : 'excerpts'] += 1;
    dailyBuckets.set(dayKey, bucket);
};

const trackTranslator = (value: CollectionEntry, translatorCounts: Map<string, number>) => {
    if (typeof value.translator !== 'number') {
        return;
    }

    const translatorId = String(value.translator);
    translatorCounts.set(translatorId, (translatorCounts.get(translatorId) ?? 0) + 1);
};

const updateCollectionSummary = (
    collection: CollectionKey,
    value: CollectionEntry,
    accumulator: AnalyticsAccumulator,
) => {
    const summary =
        collection === 'excerpts'
            ? accumulator.excerptsSummary
            : collection === 'headings'
              ? accumulator.headingsSummary
              : null;

    if (!summary) {
        return;
    }

    summary.total += 1;
    if (isTranslated(value)) {
        summary.translated += 1;
    } else {
        summary.untranslated += 1;
    }
};

const processCollectionEntry = (
    collection: CollectionKey,
    value: CollectionEntry,
    accumulator: AnalyticsAccumulator,
) => {
    updateCollectionSummary(collection, value, accumulator);

    const duplicateTracking = trackDuplicateTranslations(value, accumulator.duplicateAltCountDistribution);
    accumulator.duplicateTranslationSegmentCount += duplicateTracking.duplicateTranslationSegmentCount;
    accumulator.duplicateTranslationsTotal += duplicateTracking.duplicateTranslationsTotal;
    accumulator.patchCount += trackPatchedTranslation(value, accumulator.patchTypeCounts);

    if (!isTranslated(value)) {
        return;
    }

    trackTranslator(value, accumulator.translatorCounts);
    trackTimelineBucket(collection, value, accumulator.dailyBuckets);
};

const getTimelineGranularity = (dailyBuckets: Map<string, TimelineBucket>): TimelineGranularity => {
    const dayKeys = [...dailyBuckets.keys()].sort((left, right) => left.localeCompare(right));
    if (dayKeys.length <= 1) {
        return 'day';
    }

    const firstDay = toUtcDate(dayKeys[0]).getTime();
    const lastDay = toUtcDate(dayKeys.at(-1) ?? dayKeys[0]).getTime();
    const spanDays = Math.floor((lastDay - firstDay) / MS_PER_DAY) + 1;

    if (spanDays > 365) {
        return 'month';
    }

    if (spanDays > 90) {
        return 'week';
    }

    return 'day';
};

const downsampleTimelineBuckets = (
    dailyBuckets: Map<string, TimelineBucket>,
    granularity: TimelineGranularity,
): Map<string, TimelineBucket> => {
    if (granularity === 'day') {
        return dailyBuckets;
    }

    const groupedBuckets = new Map<string, TimelineBucket>();

    for (const [dayKey, bucket] of dailyBuckets.entries()) {
        const groupedKey = granularity === 'week' ? getWeekStartDayKey(dayKey) : getMonthStartDayKey(dayKey);
        const groupedBucket = groupedBuckets.get(groupedKey) ?? { excerpts: 0, headings: 0 };
        groupedBucket.excerpts += bucket.excerpts;
        groupedBucket.headings += bucket.headings;
        groupedBuckets.set(groupedKey, groupedBucket);
    }

    return groupedBuckets;
};

const formatTimelineLabel = (dayKey: string, granularity: TimelineGranularity) => {
    if (granularity === 'week') {
        return formatWeekLabel(dayKey);
    }

    if (granularity === 'month') {
        return formatMonthLabel(dayKey);
    }

    return formatDayLabel(dayKey);
};

const buildTranslatorDistribution = (translatorCounts: Map<string, number>) => {
    const totalTranslatorUses = [...translatorCounts.values()].reduce((sum, count) => sum + count, 0);
    const sortedEntries = [...translatorCounts.entries()].sort(
        ([leftId, leftCount], [rightId, rightCount]) => rightCount - leftCount || leftId.localeCompare(rightId),
    );
    const visibleEntries =
        sortedEntries.length > MAX_VISIBLE_TRANSLATOR_SLICES
            ? [
                  ...sortedEntries.slice(0, MAX_VISIBLE_TRANSLATOR_SLICES - 1),
                  [
                      'other',
                      sortedEntries.slice(MAX_VISIBLE_TRANSLATOR_SLICES - 1).reduce((sum, [, count]) => sum + count, 0),
                  ] as const,
              ]
            : sortedEntries;

    return visibleEntries.map(([id, count]) => {
        if (id === 'other') {
            const hiddenTranslatorCount = Math.max(0, sortedEntries.length - (MAX_VISIBLE_TRANSLATOR_SLICES - 1));
            return {
                count,
                id,
                label: `Other (${hiddenTranslatorCount})`,
                percent: totalTranslatorUses > 0 ? roundToDecimal((count / totalTranslatorUses) * 100, 1) : 0,
            };
        }

        const model = getTranslationModelById(id);
        return {
            count,
            id,
            label: model?.label ?? `Translator ${id}`,
            percent: totalTranslatorUses > 0 ? roundToDecimal((count / totalTranslatorUses) * 100, 1) : 0,
        };
    });
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
    const timelineGranularity = getTimelineGranularity(dailyBuckets);
    const timelineBuckets = downsampleTimelineBuckets(dailyBuckets, timelineGranularity);

    let cumulativeTranslated = 0;
    const timeline = [...timelineBuckets.entries()]
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
                label: formatTimelineLabel(date, timelineGranularity),
                translated,
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
        timelineGranularity,
        totalSegments,
        translatedSegments,
        translators: buildTranslatorDistribution(translatorCounts),
        uniqueTranslators: translatorCounts.size,
        untranslatedSegments,
        workDurationSeconds:
            createdAt !== null && lastUpdatedAt !== null ? Math.max(0, lastUpdatedAt - createdAt) : null,
    };
};

const loadCompilationAnalyticsSinglePass = async (filePath: string, mtimeMs: number): Promise<AnalyticsCache> => {
    return withPerfSpan(
        'analytics',
        'single_pass_compute',
        async () => {
            const accumulator = createAnalyticsAccumulator();
            const tokenStream = getInputStream(filePath).pipe(parser.asStream());
            let depth = 0;
            let activeCollection: CollectionKey | null = null;
            let currentTopLevelKey: string | null = null;
            let itemAssembler: JsonAssembler | null = null;
            let itemCollection: CollectionKey | null = null;

            for await (const chunk of tokenStream as AsyncIterable<JsonToken>) {
                if (itemAssembler) {
                    itemAssembler.consume(chunk);
                    if (itemAssembler.done && itemCollection) {
                        processCollectionEntry(itemCollection, itemAssembler.current as CollectionEntry, accumulator);
                        itemAssembler = null;
                        itemCollection = null;
                    }
                } else {
                    if (chunk.name === 'keyValue' && depth === 1) {
                        currentTopLevelKey = chunk.value ?? null;
                    } else if (chunk.name === 'numberValue' && depth === 1) {
                        const value = parseFiniteNumber(chunk.value);
                        if (currentTopLevelKey === 'createdAt') {
                            accumulator.createdAt = value;
                        } else if (currentTopLevelKey === 'lastUpdatedAt') {
                            accumulator.lastUpdatedAt = value;
                        }
                        currentTopLevelKey = null;
                    } else if (chunk.name === 'startArray' && depth === 1 && isCollectionKey(currentTopLevelKey)) {
                        activeCollection = currentTopLevelKey;
                        currentTopLevelKey = null;
                    } else if (chunk.name === 'startObject' && activeCollection && depth === 2) {
                        itemCollection = activeCollection;
                        itemAssembler = new SimpleJsonAssembler();
                        itemAssembler.consume(chunk);
                    }
                }

                if (chunk.name === 'startObject' || chunk.name === 'startArray') {
                    depth += 1;
                } else if (chunk.name === 'endObject' || chunk.name === 'endArray') {
                    depth -= 1;
                    if (chunk.name === 'endArray' && activeCollection && depth === 1) {
                        activeCollection = null;
                    }
                }
            }

            const analytics = summarizeCompilationAnalytics(accumulator);
            perfLog('analytics', 'single_pass_summary', {
                filePath,
                patchCount: analytics.patchCount,
                timelineBuckets: analytics.timeline.length,
                totalSegments: analytics.totalSegments,
                translators: analytics.translators.length,
            });
            return { analytics, filePath, mtimeMs };
        },
        { filePath },
    );
};

export const getCompilationAnalyticsSnapshotPath = (compilationFilePath: string) => {
    const parsedPath = path.parse(compilationFilePath);
    return path.join(parsedPath.dir, `.${parsedPath.name}.analytics-cache.json`);
};

const isCompilationAnalyticsResponse = (value: unknown): value is CompilationAnalyticsResponse => {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const candidate = value as Partial<CompilationAnalyticsResponse>;
    return (
        Array.isArray(candidate.timeline) &&
        Array.isArray(candidate.translators) &&
        Array.isArray(candidate.patchTypeDistribution) &&
        Array.isArray(candidate.duplicateTranslationAltCountDistribution) &&
        (candidate.timelineGranularity === 'day' ||
            candidate.timelineGranularity === 'week' ||
            candidate.timelineGranularity === 'month') &&
        typeof candidate.totalSegments === 'number'
    );
};

const readCompilationAnalyticsSnapshot = async (
    compilationFilePath: string,
    sourceMtimeMs: number,
): Promise<CompilationAnalyticsResponse | null> => {
    const timer = createPerfTimer('analytics', 'read_snapshot', { compilationFilePath });
    try {
        const snapshotPath = getCompilationAnalyticsSnapshotPath(compilationFilePath);
        const snapshot = JSON.parse(await fs.readFile(snapshotPath, 'utf8')) as Partial<AnalyticsSnapshot>;

        if (
            snapshot.version !== ANALYTICS_SNAPSHOT_VERSION ||
            snapshot.sourceMtimeMs !== sourceMtimeMs ||
            !isCompilationAnalyticsResponse(snapshot.analytics)
        ) {
            timer.end({ hit: false, reason: 'stale_or_invalid' });
            return null;
        }

        timer.end({ hit: true });
        return snapshot.analytics;
    } catch {
        timer.end({ hit: false, reason: 'missing_or_unreadable' });
        return null;
    }
};

const writeCompilationAnalyticsSnapshot = async (
    compilationFilePath: string,
    sourceMtimeMs: number,
    analytics: CompilationAnalyticsResponse,
) => {
    await withPerfSpan(
        'analytics',
        'write_snapshot',
        async () => {
            const snapshotPath = getCompilationAnalyticsSnapshotPath(compilationFilePath);
            const tempPath = `${snapshotPath}.${randomUUID()}.tmp`;
            const snapshot: AnalyticsSnapshot = { analytics, sourceMtimeMs, version: ANALYTICS_SNAPSHOT_VERSION };

            await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
            await fs.writeFile(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
            await fs.rename(tempPath, snapshotPath);
        },
        { compilationFilePath },
    );
};

export const invalidateCompilationAnalyticsCache = (filePath?: string) => {
    if (!filePath || !analyticsCache || analyticsCache.filePath === filePath) {
        analyticsCache = null;
    }

    analyticsPromise = null;
};

export const getCompilationAnalytics = async (): Promise<CompilationAnalyticsResponse> => {
    return withPerfSpan('analytics', 'get_compilation_analytics', async () => {
        const filePath = requireCompilationFilePath();
        const fileStats = await fs.stat(filePath);

        if (analyticsCache && analyticsCache.filePath === filePath && analyticsCache.mtimeMs === fileStats.mtimeMs) {
            perfLog('analytics', 'cache_hit', { filePath, layer: 'memory' });
            return analyticsCache.analytics;
        }

        perfLog('analytics', 'cache_miss', { filePath, layer: 'memory' });

        if (!analyticsPromise) {
            analyticsPromise = (async () => {
                const snapshotAnalytics = await readCompilationAnalyticsSnapshot(filePath, fileStats.mtimeMs);
                if (snapshotAnalytics) {
                    perfLog('analytics', 'cache_hit', { filePath, layer: 'snapshot' });
                    const snapshotCache = { analytics: snapshotAnalytics, filePath, mtimeMs: fileStats.mtimeMs };
                    analyticsCache = snapshotCache;
                    return snapshotCache;
                }

                perfLog('analytics', 'cache_miss', { filePath, layer: 'snapshot' });
                const cache = await loadCompilationAnalyticsSinglePass(filePath, fileStats.mtimeMs);
                analyticsCache = cache;
                await writeCompilationAnalyticsSnapshot(filePath, fileStats.mtimeMs, cache.analytics);
                return cache;
            })().finally(() => {
                analyticsPromise = null;
            });
        } else {
            perfLog('analytics', 'await_inflight', { filePath });
        }

        return (await analyticsPromise).analytics;
    });
};

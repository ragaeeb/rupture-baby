import '@tanstack/react-start/server-only';

import { randomUUID } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { parser } from 'stream-json';

import type { CompilationCollectionKey } from '@/lib/compilation-browser-shared';
import {
    type CompilationStats,
    type CountBucket,
    summarizeCompilationAnalytics,
    summarizeCompilationStats,
} from '@/lib/compilation-metrics';
import { requireCompilationFilePath } from '@/lib/data-paths';
import type { CompilationAnalyticsResponse } from '@/lib/shell-types';
import type { Excerpt, Heading, PatchedTranslationMetadata } from '@/types/compilation';

type CollectionKey = CompilationCollectionKey;
type TimelineBucket = { excerpts: number; headings: number };
type PatchType = PatchedTranslationMetadata['type'];
type ExcerptLike = Pick<Excerpt, 'lastUpdatedAt' | 'meta' | 'text' | 'translator'>;
type HeadingLike = Pick<Heading, 'lastUpdatedAt' | 'meta' | 'text' | 'translator'>;
type CollectionEntry = (Excerpt | Heading) & (ExcerptLike | HeadingLike);
type JsonToken = { name: string; value?: string };
type JsonAssembler = { consume: (chunk: JsonToken) => unknown; current: unknown; done: boolean };

export type CompilationBrowseSummary = Record<CompilationCollectionKey, CountBucket>;
export type CompilationSnapshot = {
    analytics: CompilationAnalyticsResponse;
    browseSummary: CompilationBrowseSummary;
    createdAt: number | null;
    filePath: string;
    lastUpdatedAt: number | null;
    mtimeMs: number;
    promptForTranslation: string;
    promptId: string | null;
    stats: CompilationStats;
    untranslatedExcerpts: Excerpt[];
    untranslatedFootnotes: Excerpt[];
    untranslatedHeadings: Excerpt[];
};

type CompilationSnapshotDisk = Omit<CompilationSnapshot, 'filePath' | 'mtimeMs'> & {
    sourceMtimeMs: number;
    version: 1;
};
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
type StatsAccumulator = {
    createdAt: number | null;
    excerptStats: CountBucket;
    headingStats: CountBucket;
    lastUpdatedAt: number | null;
    translators: Set<number>;
};
type SnapshotAccumulator = {
    analytics: AnalyticsAccumulator;
    browseSummary: CompilationBrowseSummary;
    promptForTranslation: string;
    promptId: string | null;
    stats: StatsAccumulator;
    untranslatedExcerpts: Excerpt[];
    untranslatedFootnotes: Excerpt[];
    untranslatedHeadings: Excerpt[];
};

const SNAPSHOT_VERSION = 1;
const MS_PER_DAY = 86_400_000;

let compilationSnapshotCache: CompilationSnapshot | null = null;
let compilationSnapshotPromise: Promise<CompilationSnapshot> | null = null;

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

const createCountBucket = (): CountBucket => ({ total: 0, translated: 0, untranslated: 0 });

const createCompilationBrowseSummary = (): CompilationBrowseSummary => ({
    excerpts: createCountBucket(),
    footnotes: createCountBucket(),
    headings: createCountBucket(),
});

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

const createStatsAccumulator = (): StatsAccumulator => ({
    createdAt: null,
    excerptStats: createCountBucket(),
    headingStats: createCountBucket(),
    lastUpdatedAt: null,
    translators: new Set(),
});

const createSnapshotAccumulator = (): SnapshotAccumulator => ({
    analytics: createAnalyticsAccumulator(),
    browseSummary: createCompilationBrowseSummary(),
    promptForTranslation: '',
    promptId: null,
    stats: createStatsAccumulator(),
    untranslatedExcerpts: [],
    untranslatedFootnotes: [],
    untranslatedHeadings: [],
});

const parseFiniteNumber = (value: unknown) => {
    const numberValue =
        typeof value === 'number' ? value : typeof value === 'string' && value.trim().length > 0 ? Number(value) : NaN;

    return Number.isFinite(numberValue) ? numberValue : null;
};

const isCollectionKey = (value: string | null): value is CollectionKey =>
    value === 'excerpts' || value === 'footnotes' || value === 'headings';

const isTranslated = (value: { text?: string | null }) => Boolean(value.text);

const getAlternativeTranslationCount = (value: { meta?: { alt?: unknown } }) =>
    Array.isArray(value.meta?.alt) ? value.meta.alt.length : 0;

const getPatchType = (value: { meta?: { patched?: unknown } }): PatchType | null => {
    const patchType = (value.meta?.patched as { type?: unknown } | undefined)?.type;
    return patchType === 'all_caps_correction' || patchType === 'arabic_leak_correction' ? patchType : null;
};

const toDayKey = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10);

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

const updateAnalyticsCollectionSummary = (
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

const trackDuplicateTranslations = (value: CollectionEntry, accumulator: AnalyticsAccumulator) => {
    const alternativeTranslationCount = getAlternativeTranslationCount(value);
    if (alternativeTranslationCount === 0) {
        return;
    }

    accumulator.duplicateAltCountDistribution.set(
        alternativeTranslationCount,
        (accumulator.duplicateAltCountDistribution.get(alternativeTranslationCount) ?? 0) + 1,
    );
    accumulator.duplicateTranslationSegmentCount += 1;
    accumulator.duplicateTranslationsTotal += alternativeTranslationCount;
};

const trackPatchedTranslation = (value: CollectionEntry, accumulator: AnalyticsAccumulator) => {
    const patchType = getPatchType(value);
    if (!patchType) {
        return;
    }

    accumulator.patchTypeCounts.set(patchType, (accumulator.patchTypeCounts.get(patchType) ?? 0) + 1);
    accumulator.patchCount += 1;
};

const updateStatsCollectionSummary = (
    collection: CollectionKey,
    value: CollectionEntry,
    accumulator: StatsAccumulator,
) => {
    const bucket =
        collection === 'excerpts'
            ? accumulator.excerptStats
            : collection === 'headings'
              ? accumulator.headingStats
              : null;
    if (!bucket) {
        return;
    }

    bucket.total += 1;
    if (isTranslated(value)) {
        bucket.translated += 1;
    } else {
        bucket.untranslated += 1;
    }

    if (collection === 'excerpts' && typeof value.translator === 'number') {
        accumulator.translators.add(value.translator);
    }
};

const updateBrowseSummary = (
    collection: CollectionKey,
    value: CollectionEntry,
    browseSummary: CompilationBrowseSummary,
) => {
    const bucket = browseSummary[collection];
    bucket.total += 1;
    if (isTranslated(value)) {
        bucket.translated += 1;
    } else {
        bucket.untranslated += 1;
    }
};

const pushUntranslatedEntry = (collection: CollectionKey, value: CollectionEntry, accumulator: SnapshotAccumulator) => {
    if (isTranslated(value)) {
        return;
    }

    if (collection === 'excerpts') {
        accumulator.untranslatedExcerpts.push(value as Excerpt);
        return;
    }

    if (collection === 'headings') {
        accumulator.untranslatedHeadings.push(value as Excerpt);
        return;
    }

    accumulator.untranslatedFootnotes.push(value as Excerpt);
};

const processCollectionEntry = (
    collection: CollectionKey,
    value: CollectionEntry,
    accumulator: SnapshotAccumulator,
) => {
    updateBrowseSummary(collection, value, accumulator.browseSummary);
    updateAnalyticsCollectionSummary(collection, value, accumulator.analytics);
    trackDuplicateTranslations(value, accumulator.analytics);
    trackPatchedTranslation(value, accumulator.analytics);
    updateStatsCollectionSummary(collection, value, accumulator.stats);
    pushUntranslatedEntry(collection, value, accumulator);

    if (!isTranslated(value)) {
        return;
    }

    trackTranslator(value, accumulator.analytics.translatorCounts);
    trackTimelineBucket(collection, value, accumulator.analytics.dailyBuckets);
};

const buildSnapshotPayload = (accumulator: SnapshotAccumulator): Omit<CompilationSnapshot, 'filePath' | 'mtimeMs'> => {
    const stats = summarizeCompilationStats({
        createdAt: accumulator.stats.createdAt,
        excerptStats: accumulator.stats.excerptStats,
        headingStats: accumulator.stats.headingStats,
        lastUpdatedAt: accumulator.stats.lastUpdatedAt,
        uniqueTranslators: accumulator.stats.translators.size,
    });

    const analytics = summarizeCompilationAnalytics({
        createdAt: accumulator.analytics.createdAt,
        dailyBuckets: accumulator.analytics.dailyBuckets,
        duplicateAltCountDistribution: accumulator.analytics.duplicateAltCountDistribution,
        duplicateTranslationSegmentCount: accumulator.analytics.duplicateTranslationSegmentCount,
        duplicateTranslationsTotal: accumulator.analytics.duplicateTranslationsTotal,
        excerptsSummary: accumulator.analytics.excerptsSummary,
        headingsSummary: accumulator.analytics.headingsSummary,
        lastUpdatedAt: accumulator.analytics.lastUpdatedAt,
        patchCount: accumulator.analytics.patchCount,
        patchTypeCounts: accumulator.analytics.patchTypeCounts,
        translatorCounts: accumulator.analytics.translatorCounts,
    });

    return {
        analytics,
        browseSummary: accumulator.browseSummary,
        createdAt: accumulator.stats.createdAt,
        lastUpdatedAt: accumulator.stats.lastUpdatedAt,
        promptForTranslation: accumulator.promptForTranslation,
        promptId: accumulator.promptId,
        stats,
        untranslatedExcerpts: accumulator.untranslatedExcerpts,
        untranslatedFootnotes: accumulator.untranslatedFootnotes,
        untranslatedHeadings: accumulator.untranslatedHeadings,
    };
};

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

export const getCompilationSnapshotPath = (compilationFilePath: string) => {
    const parsedPath = path.parse(compilationFilePath);
    return path.join(parsedPath.dir, `.${parsedPath.name}.compilation-cache.json`);
};

const isCountBucket = (value: unknown): value is CountBucket =>
    typeof value === 'object' &&
    value !== null &&
    typeof (value as CountBucket).total === 'number' &&
    typeof (value as CountBucket).translated === 'number' &&
    typeof (value as CountBucket).untranslated === 'number';

const isCompilationStats = (value: unknown): value is CompilationStats => {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const candidate = value as Partial<CompilationStats>;
    return (
        isCountBucket(candidate.excerpts) &&
        isCountBucket(candidate.headings) &&
        typeof candidate.totalSegments === 'number' &&
        typeof candidate.translatedSegments === 'number' &&
        typeof candidate.untranslatedSegments === 'number' &&
        typeof candidate.uniqueTranslators === 'number'
    );
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

const isBrowseSummary = (value: unknown): value is CompilationBrowseSummary => {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const candidate = value as Partial<CompilationBrowseSummary>;
    return isCountBucket(candidate.excerpts) && isCountBucket(candidate.footnotes) && isCountBucket(candidate.headings);
};

const isCompilationSnapshotDisk = (value: unknown): value is CompilationSnapshotDisk => {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const candidate = value as Partial<CompilationSnapshotDisk>;
    return (
        candidate.version === SNAPSHOT_VERSION &&
        typeof candidate.sourceMtimeMs === 'number' &&
        typeof candidate.promptForTranslation === 'string' &&
        (candidate.promptId === null || typeof candidate.promptId === 'string') &&
        Array.isArray(candidate.untranslatedExcerpts) &&
        Array.isArray(candidate.untranslatedFootnotes) &&
        Array.isArray(candidate.untranslatedHeadings) &&
        isBrowseSummary(candidate.browseSummary) &&
        isCompilationStats(candidate.stats) &&
        isCompilationAnalyticsResponse(candidate.analytics)
    );
};

const readCompilationSnapshot = async (
    compilationFilePath: string,
    sourceMtimeMs: number,
): Promise<CompilationSnapshot | null> => {
    try {
        const snapshotPath = getCompilationSnapshotPath(compilationFilePath);
        const snapshot = JSON.parse(await fs.readFile(snapshotPath, 'utf8')) as unknown;

        if (!isCompilationSnapshotDisk(snapshot) || snapshot.sourceMtimeMs !== sourceMtimeMs) {
            return null;
        }

        return {
            analytics: snapshot.analytics,
            browseSummary: snapshot.browseSummary,
            createdAt: snapshot.createdAt,
            filePath: compilationFilePath,
            lastUpdatedAt: snapshot.lastUpdatedAt,
            mtimeMs: sourceMtimeMs,
            promptForTranslation: snapshot.promptForTranslation,
            promptId: snapshot.promptId,
            stats: snapshot.stats,
            untranslatedExcerpts: snapshot.untranslatedExcerpts,
            untranslatedFootnotes: snapshot.untranslatedFootnotes,
            untranslatedHeadings: snapshot.untranslatedHeadings,
        };
    } catch {
        return null;
    }
};

const writeCompilationSnapshot = async (snapshot: CompilationSnapshot) => {
    const snapshotPath = getCompilationSnapshotPath(snapshot.filePath);
    const tempPath = `${snapshotPath}.${randomUUID()}.tmp`;
    const payload: CompilationSnapshotDisk = {
        analytics: snapshot.analytics,
        browseSummary: snapshot.browseSummary,
        createdAt: snapshot.createdAt,
        lastUpdatedAt: snapshot.lastUpdatedAt,
        promptForTranslation: snapshot.promptForTranslation,
        promptId: snapshot.promptId,
        sourceMtimeMs: snapshot.mtimeMs,
        stats: snapshot.stats,
        untranslatedExcerpts: snapshot.untranslatedExcerpts,
        untranslatedFootnotes: snapshot.untranslatedFootnotes,
        untranslatedHeadings: snapshot.untranslatedHeadings,
        version: SNAPSHOT_VERSION,
    };

    await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
    await fs.writeFile(tempPath, `${JSON.stringify(payload)}\n`, 'utf8');
    await fs.rename(tempPath, snapshotPath);
};

type SnapshotTraversalState = {
    activeCollection: CollectionKey | null;
    currentTopLevelKey: string | null;
    depth: number;
    itemAssembler: JsonAssembler | null;
    itemCollection: CollectionKey | null;
};

const createSnapshotTraversalState = (): SnapshotTraversalState => ({
    activeCollection: null,
    currentTopLevelKey: null,
    depth: 0,
    itemAssembler: null,
    itemCollection: null,
});

const finalizeSnapshotCollectionItem = (
    state: SnapshotTraversalState,
    accumulator: SnapshotAccumulator,
    chunk: JsonToken,
) => {
    state.itemAssembler?.consume(chunk);
    if (!state.itemAssembler?.done || !state.itemCollection) {
        return;
    }

    processCollectionEntry(state.itemCollection, state.itemAssembler.current as CollectionEntry, accumulator);
    state.itemAssembler = null;
    state.itemCollection = null;
};

const handleSnapshotScalarValue = (
    state: SnapshotTraversalState,
    accumulator: SnapshotAccumulator,
    chunk: JsonToken,
) => {
    if (chunk.name === 'numberValue') {
        const value = parseFiniteNumber(chunk.value);
        if (state.currentTopLevelKey === 'createdAt') {
            accumulator.stats.createdAt = value;
            accumulator.analytics.createdAt = value;
        } else if (state.currentTopLevelKey === 'lastUpdatedAt') {
            accumulator.stats.lastUpdatedAt = value;
            accumulator.analytics.lastUpdatedAt = value;
        }
        state.currentTopLevelKey = null;
        return;
    }

    if (chunk.name === 'stringValue') {
        if (state.currentTopLevelKey === 'promptForTranslation') {
            accumulator.promptForTranslation = chunk.value ?? '';
        } else if (state.currentTopLevelKey === 'promptId') {
            accumulator.promptId = (chunk.value ?? '').trim() || null;
        }
        state.currentTopLevelKey = null;
        return;
    }

    if (chunk.name === 'nullValue' && state.currentTopLevelKey === 'promptId') {
        accumulator.promptId = null;
        state.currentTopLevelKey = null;
    }
};

const handleSnapshotTraversalChunk = (
    state: SnapshotTraversalState,
    accumulator: SnapshotAccumulator,
    chunk: JsonToken,
) => {
    if (state.itemAssembler) {
        finalizeSnapshotCollectionItem(state, accumulator, chunk);
        return;
    }

    if (chunk.name === 'keyValue' && state.depth === 1) {
        state.currentTopLevelKey = chunk.value ?? null;
        return;
    }

    if (
        state.depth === 1 &&
        (chunk.name === 'numberValue' || chunk.name === 'stringValue' || chunk.name === 'nullValue')
    ) {
        handleSnapshotScalarValue(state, accumulator, chunk);
        return;
    }

    if (chunk.name === 'startArray' && state.depth === 1 && isCollectionKey(state.currentTopLevelKey)) {
        state.activeCollection = state.currentTopLevelKey;
        state.currentTopLevelKey = null;
        return;
    }

    if (chunk.name === 'startObject' && state.activeCollection && state.depth === 2) {
        state.itemCollection = state.activeCollection;
        state.itemAssembler = new SimpleJsonAssembler();
        state.itemAssembler.consume(chunk);
    }
};

const updateSnapshotTraversalDepth = (state: SnapshotTraversalState, chunk: JsonToken) => {
    if (chunk.name === 'startObject' || chunk.name === 'startArray') {
        state.depth += 1;
        return;
    }

    if (chunk.name === 'endObject' || chunk.name === 'endArray') {
        state.depth -= 1;
        if (chunk.name === 'endArray' && state.activeCollection && state.depth === 1) {
            state.activeCollection = null;
        }
    }
};

const buildCompilationSnapshot = async (filePath: string, mtimeMs: number): Promise<CompilationSnapshot> => {
    const accumulator = createSnapshotAccumulator();
    const tokenStream = getInputStream(filePath).pipe(parser.asStream());
    const traversalState = createSnapshotTraversalState();

    for await (const chunk of tokenStream as AsyncIterable<JsonToken>) {
        handleSnapshotTraversalChunk(traversalState, accumulator, chunk);
        updateSnapshotTraversalDepth(traversalState, chunk);
    }

    return { ...buildSnapshotPayload(accumulator), filePath, mtimeMs };
};

export const invalidateCompilationSnapshot = (filePath?: string) => {
    if (!filePath || !compilationSnapshotCache || compilationSnapshotCache.filePath === filePath) {
        compilationSnapshotCache = null;
    }

    compilationSnapshotPromise = null;
};

export const getCompilationSnapshot = async (): Promise<CompilationSnapshot> => {
    const filePath = await requireCompilationFilePath();
    const fileStats = await fs.stat(filePath);

    if (
        compilationSnapshotCache &&
        compilationSnapshotCache.filePath === filePath &&
        compilationSnapshotCache.mtimeMs === fileStats.mtimeMs
    ) {
        return compilationSnapshotCache;
    }

    if (!compilationSnapshotPromise) {
        compilationSnapshotPromise = (async () => {
            const diskSnapshot = await readCompilationSnapshot(filePath, fileStats.mtimeMs);
            if (diskSnapshot) {
                compilationSnapshotCache = diskSnapshot;
                return diskSnapshot;
            }

            const builtSnapshot = await buildCompilationSnapshot(filePath, fileStats.mtimeMs);
            compilationSnapshotCache = builtSnapshot;
            await writeCompilationSnapshot(builtSnapshot);
            return builtSnapshot;
        })().finally(() => {
            compilationSnapshotPromise = null;
        });
    }

    return compilationSnapshotPromise;
};

export const getCompilationSnapshotUntranslatedPickerItems = async (): Promise<Excerpt[]> => {
    const snapshot = await getCompilationSnapshot();
    return [...snapshot.untranslatedExcerpts, ...snapshot.untranslatedHeadings, ...snapshot.untranslatedFootnotes];
};

export const getCompilationSnapshotShiftQueue = async () => {
    const snapshot = await getCompilationSnapshot();
    return [
        ...snapshot.untranslatedExcerpts.map((excerpt) => ({ id: excerpt.id, nass: excerpt.nass })),
        ...snapshot.untranslatedHeadings.map((excerpt) => ({ id: excerpt.id, nass: excerpt.nass })),
        ...snapshot.untranslatedFootnotes.map((excerpt) => ({ id: excerpt.id, nass: excerpt.nass })),
    ];
};

export const __resetCompilationSnapshotForTests = () => {
    compilationSnapshotCache = null;
    compilationSnapshotPromise = null;
};

export const __getMsPerDayForTests = () => MS_PER_DAY;

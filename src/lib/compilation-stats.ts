import '@tanstack/react-start/server-only';

import { randomUUID } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { parser } from 'stream-json';

import { requireCompilationFilePath } from '@/lib/data-paths';
import { createPerfTimer, perfLog, withPerfSpan } from '@/lib/perf-log';
import type { Excerpt, Heading } from '@/types/compilation';

export type CompilationStats = {
    createdAt: number | null;
    excerpts: { total: number; translated: number; untranslated: number };
    headings: { total: number; translated: number; untranslated: number };
    lastUpdatedAt: number | null;
    totalSegments: number;
    translatedSegments: number;
    untranslatedSegments: number;
    uniqueTranslators: number;
    workDurationMs: number | null;
};

type CollectionKey = 'excerpts' | 'headings';
type CompilationStatsCache = { filePath: string; mtimeMs: number; stats: CompilationStats };
type CompilationStatsSnapshot = { sourceMtimeMs: number; stats: CompilationStats; version: 1 };
type CountBucket = { total: number; translated: number; untranslated: number };
type ExcerptLike = Pick<Excerpt, 'text' | 'translator'>;
type HeadingLike = Pick<Heading, 'text'>;
type CollectionEntry = ExcerptLike | HeadingLike;
type JsonToken = { name: string; value?: string };
type JsonAssembler = { consume: (chunk: JsonToken) => unknown; current: unknown; done: boolean };
type CompilationStatsAccumulator = {
    createdAt: number | null;
    excerptStats: CountBucket;
    headingStats: CountBucket;
    lastUpdatedAt: number | null;
    translators: Set<number>;
};

const COMPILATION_STATS_SNAPSHOT_VERSION = 1;

let compilationStatsCache: CompilationStatsCache | null = null;
let compilationStatsPromise: Promise<CompilationStatsCache> | null = null;

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

const createAccumulator = (): CompilationStatsAccumulator => ({
    createdAt: null,
    excerptStats: createCountBucket(),
    headingStats: createCountBucket(),
    lastUpdatedAt: null,
    translators: new Set(),
});

const isTranslated = (value: { text?: string | null }) => Boolean(value.text);

const parseFiniteNumber = (value: unknown) => {
    const numberValue =
        typeof value === 'number' ? value : typeof value === 'string' && value.trim().length > 0 ? Number(value) : NaN;

    return Number.isFinite(numberValue) ? numberValue : null;
};

const isCollectionKey = (value: string | null): value is CollectionKey => value === 'excerpts' || value === 'headings';

export const summarizeCompilationStats = ({
    createdAt,
    excerptStats,
    headingStats,
    lastUpdatedAt,
    uniqueTranslators,
}: {
    createdAt: number | null;
    excerptStats: CountBucket;
    headingStats: CountBucket;
    lastUpdatedAt: number | null;
    uniqueTranslators: number;
}): CompilationStats => {
    const translatedSegments = excerptStats.translated + headingStats.translated;
    const untranslatedSegments = excerptStats.untranslated + headingStats.untranslated;
    const totalSegments = excerptStats.total + headingStats.total;

    return {
        createdAt,
        excerpts: excerptStats,
        headings: headingStats,
        lastUpdatedAt,
        totalSegments,
        translatedSegments,
        uniqueTranslators,
        untranslatedSegments,
        workDurationMs: createdAt !== null && lastUpdatedAt !== null ? Math.max(0, lastUpdatedAt - createdAt) : null,
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

const trackCollectionEntry = (
    collection: CollectionKey,
    value: CollectionEntry,
    accumulator: CompilationStatsAccumulator,
) => {
    const bucket = collection === 'excerpts' ? accumulator.excerptStats : accumulator.headingStats;
    bucket.total += 1;
    if (isTranslated(value)) {
        bucket.translated += 1;
    } else {
        bucket.untranslated += 1;
    }

    if (collection === 'excerpts' && typeof (value as ExcerptLike).translator === 'number') {
        accumulator.translators.add((value as ExcerptLike).translator as number);
    }
};

const loadCompilationStatsSinglePass = async (filePath: string, mtimeMs: number): Promise<CompilationStatsCache> =>
    withPerfSpan(
        'compilation-stats',
        'single_pass_compute',
        async () => {
            const accumulator = createAccumulator();
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
                        trackCollectionEntry(itemCollection, itemAssembler.current as CollectionEntry, accumulator);
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

            const stats = summarizeCompilationStats({
                createdAt: accumulator.createdAt,
                excerptStats: accumulator.excerptStats,
                headingStats: accumulator.headingStats,
                lastUpdatedAt: accumulator.lastUpdatedAt,
                uniqueTranslators: accumulator.translators.size,
            });
            perfLog('compilation-stats', 'single_pass_summary', {
                excerptCount: stats.excerpts.total,
                filePath,
                headingCount: stats.headings.total,
                totalSegments: stats.totalSegments,
                uniqueTranslators: stats.uniqueTranslators,
            });
            return { filePath, mtimeMs, stats };
        },
        { filePath },
    );

export const getCompilationStatsSnapshotPath = (compilationFilePath: string) => {
    const parsedPath = path.parse(compilationFilePath);
    return path.join(parsedPath.dir, `.${parsedPath.name}.stats-cache.json`);
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

const readCompilationStatsSnapshot = async (
    compilationFilePath: string,
    sourceMtimeMs: number,
): Promise<CompilationStats | null> => {
    const timer = createPerfTimer('compilation-stats', 'read_snapshot', { compilationFilePath });

    try {
        const snapshotPath = getCompilationStatsSnapshotPath(compilationFilePath);
        const snapshot = JSON.parse(await fs.readFile(snapshotPath, 'utf8')) as Partial<CompilationStatsSnapshot>;

        if (
            snapshot.version !== COMPILATION_STATS_SNAPSHOT_VERSION ||
            snapshot.sourceMtimeMs !== sourceMtimeMs ||
            !isCompilationStats(snapshot.stats)
        ) {
            timer.end({ hit: false, reason: 'stale_or_invalid' });
            return null;
        }

        timer.end({ hit: true });
        return snapshot.stats;
    } catch {
        timer.end({ hit: false, reason: 'missing_or_unreadable' });
        return null;
    }
};

const writeCompilationStatsSnapshot = async (
    compilationFilePath: string,
    sourceMtimeMs: number,
    stats: CompilationStats,
) =>
    withPerfSpan(
        'compilation-stats',
        'write_snapshot',
        async () => {
            const snapshotPath = getCompilationStatsSnapshotPath(compilationFilePath);
            const tempPath = `${snapshotPath}.${randomUUID()}.tmp`;
            const snapshot: CompilationStatsSnapshot = {
                sourceMtimeMs,
                stats,
                version: COMPILATION_STATS_SNAPSHOT_VERSION,
            };

            await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
            await fs.writeFile(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
            await fs.rename(tempPath, snapshotPath);
        },
        { compilationFilePath },
    );

export const invalidateCompilationStatsCache = (filePath?: string) => {
    if (!filePath || !compilationStatsCache || compilationStatsCache.filePath === filePath) {
        compilationStatsCache = null;
    }

    compilationStatsPromise = null;
};

export const getCompilationStats = async (): Promise<CompilationStats> =>
    withPerfSpan('compilation-stats', 'get_compilation_stats', async () => {
        const filePath = requireCompilationFilePath();
        const fileStats = await fs.stat(filePath);

        if (
            compilationStatsCache &&
            compilationStatsCache.filePath === filePath &&
            compilationStatsCache.mtimeMs === fileStats.mtimeMs
        ) {
            perfLog('compilation-stats', 'cache_hit', { filePath, layer: 'memory' });
            return compilationStatsCache.stats;
        }

        perfLog('compilation-stats', 'cache_miss', { filePath, layer: 'memory' });

        if (!compilationStatsPromise) {
            compilationStatsPromise = (async () => {
                const snapshotStats = await readCompilationStatsSnapshot(filePath, fileStats.mtimeMs);
                if (snapshotStats) {
                    perfLog('compilation-stats', 'cache_hit', { filePath, layer: 'snapshot' });
                    const snapshotCache = { filePath, mtimeMs: fileStats.mtimeMs, stats: snapshotStats };
                    compilationStatsCache = snapshotCache;
                    return snapshotCache;
                }

                perfLog('compilation-stats', 'cache_miss', { filePath, layer: 'snapshot' });
                const cache = await loadCompilationStatsSinglePass(filePath, fileStats.mtimeMs);
                compilationStatsCache = cache;
                await writeCompilationStatsSnapshot(filePath, fileStats.mtimeMs, cache.stats);
                return cache;
            })().finally(() => {
                compilationStatsPromise = null;
            });
        } else {
            perfLog('compilation-stats', 'await_inflight', { filePath });
        }

        return (await compilationStatsPromise).stats;
    });

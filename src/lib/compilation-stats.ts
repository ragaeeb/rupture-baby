import '@tanstack/react-start/server-only';

import { createReadStream, promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { parser } from 'stream-json';
import pick from 'stream-json/filters/pick.js';
import streamArray from 'stream-json/streamers/stream-array.js';
import streamValues from 'stream-json/streamers/stream-values.js';

import { requireCompilationFilePath } from '@/lib/data-paths';
import type { Compilation, Excerpt, Heading } from '@/types/compilation';

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

type CompilationStatsCache = { filePath: string; mtimeMs: number; stats: CompilationStats };
type CountBucket = { total: number; translated: number; untranslated: number };
type ExcerptLike = Pick<Excerpt, 'text'>;
type HeadingLike = Pick<Heading, 'text'>;
type ExcerptWithTranslator = Pick<Excerpt, 'text' | 'translator'>;

let compilationStatsCache: CompilationStatsCache | null = null;
let compilationStatsPromise: Promise<CompilationStatsCache> | null = null;

const isTranslated = (value: { text?: string | null }) => Boolean(value.text);

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

const loadCountBucket = async <T extends ExcerptLike | HeadingLike>(
    filePath: string,
    key: 'excerpts' | 'headings',
): Promise<CountBucket> => {
    const bucket: CountBucket = { total: 0, translated: 0, untranslated: 0 };
    const itemStream = getInputStream(filePath)
        .pipe(parser.asStream())
        .pipe(pick.asStream({ filter: key }))
        .pipe(streamArray.asStream());

    for await (const entry of itemStream as AsyncIterable<{ value: T }>) {
        bucket.total += 1;
        if (isTranslated(entry.value)) {
            bucket.translated += 1;
        } else {
            bucket.untranslated += 1;
        }
    }

    return bucket;
};

const loadUniqueTranslators = async (filePath: string) => {
    const translators = new Set<NonNullable<Compilation['excerpts'][number]['translator']>>();
    const excerptStream = getInputStream(filePath)
        .pipe(parser.asStream())
        .pipe(pick.asStream({ filter: 'excerpts' }))
        .pipe(streamArray.asStream());

    for await (const entry of excerptStream as AsyncIterable<{ value: ExcerptWithTranslator }>) {
        if (typeof entry.value.translator === 'number') {
            translators.add(entry.value.translator);
        }
    }

    return translators.size;
};

const loadCompilationStats = async (filePath: string, mtimeMs: number): Promise<CompilationStatsCache> => {
    const [createdAt, lastUpdatedAt, excerptStats, headingStats, uniqueTranslators] = await Promise.all([
        loadScalarNumber(filePath, 'createdAt'),
        loadScalarNumber(filePath, 'lastUpdatedAt'),
        loadCountBucket<ExcerptLike>(filePath, 'excerpts'),
        loadCountBucket<HeadingLike>(filePath, 'headings'),
        loadUniqueTranslators(filePath),
    ]);

    return {
        filePath,
        mtimeMs,
        stats: summarizeCompilationStats({ createdAt, excerptStats, headingStats, lastUpdatedAt, uniqueTranslators }),
    };
};

export const getCompilationStats = async (): Promise<CompilationStats> => {
    const filePath = requireCompilationFilePath();
    const fileStats = await fs.stat(filePath);

    if (
        compilationStatsCache &&
        compilationStatsCache.filePath === filePath &&
        compilationStatsCache.mtimeMs === fileStats.mtimeMs
    ) {
        return compilationStatsCache.stats;
    }

    if (!compilationStatsPromise) {
        compilationStatsPromise = loadCompilationStats(filePath, fileStats.mtimeMs)
            .then((cache) => {
                compilationStatsCache = cache;
                return cache;
            })
            .finally(() => {
                compilationStatsPromise = null;
            });
    }

    return (await compilationStatsPromise).stats;
};

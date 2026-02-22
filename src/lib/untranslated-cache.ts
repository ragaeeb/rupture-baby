import { createReadStream, promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/Pick';
import { streamArray } from 'stream-json/streamers/StreamArray';

import type { Excerpt } from '@/lib/compilation';
import { requireCompilationFilePath } from '@/lib/data-paths';

type ExcerptsCache = {
    filePath: string;
    untranslatedExcerpts: Excerpt[];
    untranslatedPickerItems: Excerpt[];
    mtimeMs: number;
};

let excerptsCache: ExcerptsCache | null = null;
let loadCachePromise: Promise<ExcerptsCache> | null = null;

const isUntranslated = (excerpt: Partial<Excerpt>): boolean => excerpt.text === undefined || excerpt.text === null;

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

const loadUntranslatedByKey = async (
    filePath: string,
    key: 'excerpts' | 'headings' | 'footnotes',
): Promise<Excerpt[]> => {
    const untranslated: Excerpt[] = [];
    const excerptStream = getInputStream(filePath)
        .pipe(parser())
        .pipe(pick({ filter: key }))
        .pipe(streamArray());

    for await (const entry of excerptStream as AsyncIterable<{ key: number; value: Partial<Excerpt> }>) {
        if (isUntranslated(entry.value)) {
            untranslated.push(entry.value as Excerpt);
        }
    }

    return untranslated;
};

const ensureCache = async (): Promise<ExcerptsCache> => {
    const filePath = requireCompilationFilePath();
    const fileStats = await fs.stat(filePath);

    if (excerptsCache && excerptsCache.filePath === filePath && excerptsCache.mtimeMs === fileStats.mtimeMs) {
        return excerptsCache;
    }

    if (!loadCachePromise) {
        loadCachePromise = Promise.all([
            loadUntranslatedByKey(filePath, 'excerpts'),
            loadUntranslatedByKey(filePath, 'headings'),
            loadUntranslatedByKey(filePath, 'footnotes'),
        ])
            .then(([untranslatedExcerpts, untranslatedHeadings, untranslatedFootnotes]) => {
                const untranslatedPickerItems = [
                    ...untranslatedExcerpts,
                    ...untranslatedHeadings,
                    ...untranslatedFootnotes,
                ];

                return { filePath, mtimeMs: fileStats.mtimeMs, untranslatedExcerpts, untranslatedPickerItems };
            })
            .then((cache) => {
                excerptsCache = cache;
                return cache;
            })
            .finally(() => {
                loadCachePromise = null;
            });
    }

    return loadCachePromise;
};

export const getCachedUntranslatedExcerpts = async (): Promise<Excerpt[]> => {
    const cache = await ensureCache();
    return cache.untranslatedExcerpts;
};

export const getCachedUntranslatedPickerItems = async (): Promise<Excerpt[]> => {
    const cache = await ensureCache();
    return cache.untranslatedPickerItems;
};

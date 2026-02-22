import { createReadStream, promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/Pick';
import { streamArray } from 'stream-json/streamers/StreamArray';
import { streamValues } from 'stream-json/streamers/StreamValues';

import { requireCompilationFilePath } from '@/lib/data-paths';
import type { ShiftExcerpt } from '@/lib/shift-payload';

type ShiftCache = {
    filePath: string;
    mtimeMs: number;
    prompt: string;
    queue: ShiftExcerpt[];
};

let shiftCache: ShiftCache | null = null;
let loadPromise: Promise<ShiftCache> | null = null;

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

const loadPrompt = async (filePath: string): Promise<string> => {
    const promptStream = getInputStream(filePath).pipe(parser()).pipe(pick({ filter: 'promptForTranslation' })).pipe(streamValues());

    for await (const entry of promptStream as AsyncIterable<{ key: number; value: unknown }>) {
        if (typeof entry.value === 'string') {
            return entry.value;
        }
    }

    return '';
};

const loadUntranslatedQueue = async (filePath: string): Promise<ShiftExcerpt[]> => {
    const queue: ShiftExcerpt[] = [];
    const excerptStream = getInputStream(filePath).pipe(parser()).pipe(pick({ filter: 'excerpts' })).pipe(streamArray());

    for await (const entry of excerptStream as AsyncIterable<{
        key: number;
        value: { id: string; nass: string; text?: string | null };
    }>) {
        if (entry.value.text === undefined || entry.value.text === null) {
            queue.push({
                id: entry.value.id,
                nass: entry.value.nass,
            });
        }
    }

    return queue;
};

const loadShiftCache = async (filePath: string, mtimeMs: number): Promise<ShiftCache> => {
    const [prompt, queue] = await Promise.all([loadPrompt(filePath), loadUntranslatedQueue(filePath)]);

    return {
        filePath,
        mtimeMs,
        prompt,
        queue,
    };
};

export const getShiftCache = async (): Promise<ShiftCache> => {
    const filePath = requireCompilationFilePath();
    const stats = await fs.stat(filePath);

    if (shiftCache && shiftCache.filePath === filePath && shiftCache.mtimeMs === stats.mtimeMs) {
        return shiftCache;
    }

    if (!loadPromise) {
        loadPromise = loadShiftCache(filePath, stats.mtimeMs)
            .then((cache) => {
                shiftCache = cache;
                return cache;
            })
            .finally(() => {
                loadPromise = null;
            });
    }

    return loadPromise;
};

import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { parser } from 'stream-json';
import pick from 'stream-json/filters/pick.js';
import streamArray from 'stream-json/streamers/stream-array.js';
import streamValues from 'stream-json/streamers/stream-values.js';

import { requireCompilationFilePath } from '@/lib/data-paths';
import { fileExists, readJsonFile, writeTextFile } from '@/lib/runtime-files';
import type { ShiftExcerpt } from '@/lib/shift-payload';

type ShiftCache = {
    filePath: string;
    mtimeMs: number;
    prompt: string;
    queue: ShiftExcerpt[];
    shiftedCount: number;
    shiftedIds: string[];
};
type ShiftCheckpoint = { shiftedCount: number; shiftedIds: string[] };
type ShiftCheckpointFile = { shiftedCount: number; shiftedIds?: string[]; sourceMtimeMs: number; version: 1 };

let shiftCache: ShiftCache | null = null;
let loadPromise: Promise<ShiftCache> | null = null;

const normalizeMtimeMs = (value: number) => Math.floor(value);

const isMatchingSourceMtime = (checkpointSourceMtimeMs: number | undefined, sourceMtimeMs: number) =>
    typeof checkpointSourceMtimeMs === 'number' &&
    Number.isFinite(checkpointSourceMtimeMs) &&
    normalizeMtimeMs(checkpointSourceMtimeMs) === normalizeMtimeMs(sourceMtimeMs);

const getShiftCheckpointPath = (filePath: string) => {
    const parsedPath = path.parse(filePath);
    return path.join(parsedPath.dir, `.${parsedPath.name}.settings.json`);
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

const loadPrompt = async (filePath: string): Promise<string> => {
    const promptStream = getInputStream(filePath)
        .pipe(parser.asStream())
        .pipe(pick.asStream({ filter: 'promptForTranslation' }))
        .pipe(streamValues.asStream());

    for await (const entry of promptStream as AsyncIterable<{ key: number; value: unknown }>) {
        if (typeof entry.value === 'string') {
            return entry.value;
        }
    }

    return '';
};

const loadUntranslatedQueue = async (filePath: string): Promise<ShiftExcerpt[]> => {
    const loadByKey = async (key: 'excerpts' | 'headings' | 'footnotes') => {
        const items: ShiftExcerpt[] = [];
        const excerptStream = getInputStream(filePath)
            .pipe(parser.asStream())
            .pipe(pick.asStream({ filter: key }))
            .pipe(streamArray.asStream());

        for await (const entry of excerptStream as AsyncIterable<{
            key: number;
            value: { id: string; nass: string; text?: string | null };
        }>) {
            if (entry.value.text === undefined || entry.value.text === null) {
                items.push({ id: entry.value.id, nass: entry.value.nass });
            }
        }

        return items;
    };

    const [excerpts, headings, footnotes] = await Promise.all([
        loadByKey('excerpts'),
        loadByKey('headings'),
        loadByKey('footnotes'),
    ]);

    return [...excerpts, ...headings, ...footnotes];
};

const normalizeShiftedIds = (shiftedIds: unknown) =>
    Array.isArray(shiftedIds)
        ? [...new Set(shiftedIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))]
        : [];

const readShiftCheckpoint = async (filePath: string, sourceMtimeMs: number): Promise<ShiftCheckpoint> => {
    const checkpointPath = getShiftCheckpointPath(filePath);
    if (!(await fileExists(checkpointPath))) {
        return { shiftedCount: 0, shiftedIds: [] };
    }

    try {
        const checkpoint = await readJsonFile<Partial<ShiftCheckpointFile>>(checkpointPath);
        if (checkpoint.version !== 1 || !isMatchingSourceMtime(checkpoint.sourceMtimeMs, sourceMtimeMs)) {
            return { shiftedCount: 0, shiftedIds: [] };
        }

        return {
            shiftedCount: Math.max(0, Math.floor(checkpoint.shiftedCount ?? 0)),
            shiftedIds: normalizeShiftedIds(checkpoint.shiftedIds),
        };
    } catch {
        return { shiftedCount: 0, shiftedIds: [] };
    }
};

export const saveShiftCheckpoint = async (
    filePath: string,
    sourceMtimeMs: number,
    shiftedCount: number,
    shiftedIds: string[],
) => {
    const checkpointPath = getShiftCheckpointPath(filePath);
    const checkpoint: ShiftCheckpointFile = {
        shiftedCount: Math.max(0, Math.floor(shiftedCount)),
        shiftedIds: normalizeShiftedIds(shiftedIds),
        sourceMtimeMs,
        version: 1,
    };

    await writeTextFile(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
};

const loadShiftCache = async (filePath: string, mtimeMs: number): Promise<ShiftCache> => {
    const [prompt, queue, checkpoint] = await Promise.all([
        loadPrompt(filePath),
        loadUntranslatedQueue(filePath),
        readShiftCheckpoint(filePath, mtimeMs),
    ]);
    const shiftedIds =
        checkpoint.shiftedIds.length > 0
            ? checkpoint.shiftedIds
            : queue.slice(0, checkpoint.shiftedCount).map((excerpt) => excerpt.id);
    const shiftedIdSet = new Set(shiftedIds);
    const remainingQueue =
        shiftedIdSet.size > 0 ? queue.filter((excerpt) => !shiftedIdSet.has(excerpt.id)) : queue.slice(checkpoint.shiftedCount);

    return { filePath, mtimeMs, prompt, queue: remainingQueue, shiftedCount: checkpoint.shiftedCount, shiftedIds };
};

export type ShiftSettingsInfo = {
    compilationFilePath: string;
    compilationMtimeMs: number;
    checkpointPath: string;
    checkpointSourceMtimeMs: number | null;
    shiftedCount: number;
    shiftedIdCount: number;
    lastShiftedId: string | null;
    hasCheckpoint: boolean;
    checkpointValid: boolean;
};

export const getShiftSettingsInfo = async (): Promise<ShiftSettingsInfo> => {
    const compilationFilePath = requireCompilationFilePath();
    const stats = await fs.stat(compilationFilePath);
    const compilationMtimeMs = stats.mtimeMs;
    const checkpointPath = getShiftCheckpointPath(compilationFilePath);
    const checkpointFileExists = await fileExists(checkpointPath);
    let checkpointSourceMtimeMs: number | null = null;
    let checkpointValid = false;

    if (checkpointFileExists) {
        try {
            const checkpoint = await readJsonFile<Partial<ShiftCheckpointFile>>(checkpointPath);
            checkpointSourceMtimeMs = checkpoint.sourceMtimeMs ?? null;
            checkpointValid = checkpoint.version === 1 && isMatchingSourceMtime(checkpoint.sourceMtimeMs, compilationMtimeMs);
        } catch {
            checkpointSourceMtimeMs = null;
            checkpointValid = false;
        }
    }

    const shiftedCount = await readShiftCheckpoint(compilationFilePath, compilationMtimeMs);
    const shiftedIds = shiftedCount.shiftedIds;

    return {
        compilationFilePath,
        compilationMtimeMs,
        checkpointPath,
        checkpointSourceMtimeMs,
        shiftedCount: shiftedCount.shiftedCount,
        shiftedIdCount: shiftedIds.length,
        lastShiftedId: shiftedIds.at(-1) ?? null,
        hasCheckpoint: checkpointFileExists,
        checkpointValid,
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

export const __resetShiftCacheForTests = () => {
    shiftCache = null;
    loadPromise = null;
};

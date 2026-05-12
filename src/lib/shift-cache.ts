import '@tanstack/react-start/server-only';

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { getCompilationSnapshot, getCompilationSnapshotShiftQueue } from '@/lib/compilation-cache';
import { requireCompilationFilePath } from '@/lib/data-paths';
import { fileExists, readJsonFile, writeTextFile } from '@/lib/runtime-files';
import type { ShiftSettingsResponse } from '@/lib/shell-types';
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

const isMatchingSourceMtime = (checkpointSourceMtimeMs: number | undefined, sourceMtimeMs: number) =>
    typeof checkpointSourceMtimeMs === 'number' &&
    Number.isFinite(checkpointSourceMtimeMs) &&
    Math.abs(checkpointSourceMtimeMs - sourceMtimeMs) < 1;

const getShiftCheckpointPath = (filePath: string) => {
    const parsedPath = path.parse(filePath);
    return path.join(parsedPath.dir, `.${parsedPath.name}.settings.json`);
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

const loadShiftCache = async (): Promise<ShiftCache> => {
    const snapshot = await getCompilationSnapshot();
    const [queue, checkpoint] = await Promise.all([
        getCompilationSnapshotShiftQueue(),
        readShiftCheckpoint(snapshot.filePath, snapshot.mtimeMs),
    ]);
    const shiftedIds =
        checkpoint.shiftedIds.length > 0
            ? checkpoint.shiftedIds
            : queue.slice(0, checkpoint.shiftedCount).map((excerpt) => excerpt.id);
    const shiftedIdSet = new Set(shiftedIds);
    const remainingQueue =
        shiftedIdSet.size > 0
            ? queue.filter((excerpt) => !shiftedIdSet.has(excerpt.id))
            : queue.slice(checkpoint.shiftedCount);

    return {
        filePath: snapshot.filePath,
        mtimeMs: snapshot.mtimeMs,
        prompt: snapshot.promptForTranslation,
        queue: remainingQueue,
        shiftedCount: checkpoint.shiftedCount,
        shiftedIds,
    };
};

export type ShiftSettingsInfo = ShiftSettingsResponse;

export const getShiftSettingsInfo = async (): Promise<ShiftSettingsInfo> => {
    const compilationFilePath = await requireCompilationFilePath();
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
            checkpointValid =
                checkpoint.version === 1 && isMatchingSourceMtime(checkpoint.sourceMtimeMs, compilationMtimeMs);
        } catch {
            checkpointSourceMtimeMs = null;
            checkpointValid = false;
        }
    }

    const shiftCacheState = await getShiftCache();
    const shiftedCount = shiftCacheState.shiftedCount;
    const shiftedIds = shiftCacheState.shiftedIds;

    return {
        checkpointPath,
        checkpointSourceMtimeMs,
        checkpointValid,
        compilationFilePath,
        compilationMtimeMs,
        hasCheckpoint: checkpointFileExists,
        lastShiftedId: shiftedIds.at(-1) ?? null,
        nextId: shiftCacheState.queue[0]?.id ?? null,
        remainingCount: shiftCacheState.queue.length,
        shiftedCount,
        shiftedIdCount: shiftedIds.length,
        totalCount: shiftCacheState.shiftedCount + shiftCacheState.queue.length,
    };
};

export const setShiftCheckpointPosition = async (nextShiftedCount: number): Promise<ShiftSettingsInfo> => {
    const snapshot = await getCompilationSnapshot();
    const fullQueue = await getCompilationSnapshotShiftQueue();
    const safeShiftedCount = Math.min(fullQueue.length, Math.max(0, Math.floor(nextShiftedCount)));
    const shiftedIds = fullQueue.slice(0, safeShiftedCount).map((excerpt) => excerpt.id);

    await saveShiftCheckpoint(snapshot.filePath, snapshot.mtimeMs, safeShiftedCount, shiftedIds);

    shiftCache = {
        filePath: snapshot.filePath,
        mtimeMs: snapshot.mtimeMs,
        prompt: snapshot.promptForTranslation,
        queue: fullQueue.slice(safeShiftedCount),
        shiftedCount: safeShiftedCount,
        shiftedIds,
    };

    return getShiftSettingsInfo();
};

export const getShiftCache = async (): Promise<ShiftCache> => {
    const snapshot = await getCompilationSnapshot();

    if (shiftCache && shiftCache.filePath === snapshot.filePath && shiftCache.mtimeMs === snapshot.mtimeMs) {
        return shiftCache;
    }

    if (!loadPromise) {
        loadPromise = loadShiftCache()
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

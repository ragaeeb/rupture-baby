import '@tanstack/react-start/server-only';

import { constants } from 'node:fs';
import { access, readFile, stat, writeFile } from 'node:fs/promises';

type BunFileLike = {
    exists?: () => Promise<boolean>;
    json?: () => Promise<unknown>;
    size?: number;
    text: () => Promise<string>;
};

type BunRuntimeLike = {
    file: (target: string) => BunFileLike;
    write: (target: string, data: string) => Promise<number>;
};

const getBunRuntime = (): BunRuntimeLike | null => {
    const bunRuntime = (globalThis as { Bun?: BunRuntimeLike }).Bun;
    if (!process.versions.bun || !bunRuntime?.file || !bunRuntime.write) {
        return null;
    }

    return bunRuntime;
};

export const readTextFile = async (filePath: string): Promise<string> => {
    const bunRuntime = getBunRuntime();
    if (bunRuntime) {
        return bunRuntime.file(filePath).text();
    }

    return readFile(filePath, 'utf8');
};

export const readJsonFile = async <T>(filePath: string): Promise<T> => {
    const bunRuntime = getBunRuntime();
    if (bunRuntime?.file(filePath).json) {
        return (await bunRuntime.file(filePath).json!()) as T;
    }

    return JSON.parse(await readTextFile(filePath)) as T;
};

export const writeTextFile = async (filePath: string, content: string): Promise<void> => {
    const bunRuntime = getBunRuntime();
    if (bunRuntime) {
        await bunRuntime.write(filePath, content);
        return;
    }

    await writeFile(filePath, content, 'utf8');
};

export const fileExists = async (filePath: string): Promise<boolean> => {
    const bunRuntime = getBunRuntime();
    const bunFile = bunRuntime?.file(filePath);

    if (bunFile?.exists) {
        return bunFile.exists();
    }

    try {
        await access(filePath, constants.F_OK);
        return true;
    } catch {
        return false;
    }
};

export const getFileSizeBytes = async (filePath: string): Promise<number> => {
    const bunRuntime = getBunRuntime();
    const bunFile = bunRuntime?.file(filePath);

    if (typeof bunFile?.size === 'number') {
        return bunFile.size;
    }

    const fileStats = await stat(filePath);
    return fileStats.size;
};

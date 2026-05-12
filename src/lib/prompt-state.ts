import '@tanstack/react-start/server-only';

import { renameSync, rmSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, parse } from 'node:path';

import {
    getCompilationSnapshot,
    getCompilationSnapshotPath,
    invalidateCompilationSnapshot,
} from '@/lib/compilation-cache';
import { readJsonFile, readTextFile, writeTextFile } from '@/lib/runtime-files';
import { nowInSeconds } from '@/lib/time';
import type { Compilation } from '@/types/compilation';

const PROMPTS_DIR = 'prompts';

export type PromptOption = { id: string; name: string; content: string; isMaster?: boolean };

type PromptSelection = { content: string; id: string; name: string };

let promptOptionsPromise: Promise<PromptOption[]> | null = null;
let promptWriteQueue = Promise.resolve();

const mapFileNameToDisplayName = (filename: string) =>
    filename
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

const mapFileNametoId = (filename: string) => filename.toUpperCase().replace(/-/g, '_');

const stackPrompts = (master: string, addon: string) => `${master.trim()}\n${addon.trim()}`;

const getBunRuntime = () =>
    (
        globalThis as unknown as {
            Bun?: { Glob: new (pattern: string) => { scan: (options: { cwd: string }) => AsyncIterable<string> } };
        }
    ).Bun ?? null;

const loadPrompts = async () => {
    const files: string[] = [];

    const bunRuntime = getBunRuntime();
    if (bunRuntime?.Glob) {
        for await (const filePath of new bunRuntime.Glob('*.md').scan({ cwd: PROMPTS_DIR })) {
            files.push(filePath);
        }
    } else {
        const entries = await readdir(PROMPTS_DIR, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith('.md')) {
                files.push(entry.name);
            }
        }
    }

    const sortedFiles = [...files].sort((left, right) => left.localeCompare(right));
    return Promise.all(
        sortedFiles.map(async (fileName) => {
            const { name } = parse(fileName);
            const content = await readTextFile(join(PROMPTS_DIR, fileName));

            return {
                content,
                id: mapFileNametoId(name),
                ...(name === 'master' && { isMaster: true }),
                name: mapFileNameToDisplayName(name),
            } satisfies PromptOption;
        }),
    );
};

const getPromptDefinitions = async (): Promise<PromptOption[]> => {
    if (!promptOptionsPromise) {
        promptOptionsPromise = loadPrompts();
    }

    return promptOptionsPromise;
};

const getDefaultPromptOption = async (): Promise<PromptSelection> => {
    const [firstPrompt] = await getPromptOptions();
    return firstPrompt;
};

const getPromptOptionById = async (promptId: string): Promise<PromptSelection | null> => {
    const selected = (await getPromptOptions()).find((prompt) => prompt.id === promptId);
    return selected ?? null;
};

const getPromptOptionByContent = async (content: string): Promise<PromptSelection | null> => {
    const normalizedContent = content.trim();
    if (!normalizedContent) {
        return null;
    }

    const selected = (await getPromptOptions()).find((prompt) => prompt.content.trim() === normalizedContent);
    return selected ?? null;
};

const resolvePromptSelection = async ({
    promptForTranslation,
    promptId,
}: {
    promptForTranslation: string;
    promptId: string | null;
}): Promise<PromptSelection> => {
    const resolvedContent = promptForTranslation.trim();

    if (promptId) {
        const selectedById = await getPromptOptionById(promptId);
        if (selectedById) {
            return { ...selectedById, content: resolvedContent || selectedById.content };
        }
    }

    const selectedByContent = await getPromptOptionByContent(promptForTranslation);
    if (selectedByContent) {
        return { ...selectedByContent, content: resolvedContent || selectedByContent.content };
    }

    const defaultPrompt = await getDefaultPromptOption();
    return { ...defaultPrompt, content: resolvedContent || defaultPrompt.content };
};

const writeCompilationPromptSelection = async (selectedPrompt: PromptSelection): Promise<void> => {
    const snapshot = await getCompilationSnapshot();
    const compilation = await readJsonFile<Compilation>(snapshot.filePath);

    compilation.lastUpdatedAt = nowInSeconds();
    compilation.promptForTranslation = selectedPrompt.content;
    compilation.promptId = selectedPrompt.id;

    const tempPath = `${snapshot.filePath}.${process.pid}.${Date.now()}.tmp`;
    const snapshotPath = getCompilationSnapshotPath(snapshot.filePath);

    try {
        await writeTextFile(tempPath, `${JSON.stringify(compilation)}\n`);
        renameSync(tempPath, snapshot.filePath);
        rmSync(snapshotPath, { force: true });
        invalidateCompilationSnapshot(snapshot.filePath);
    } catch (error) {
        rmSync(tempPath, { force: true });
        throw error;
    }
};

export const getPromptOptions = async (): Promise<PromptSelection[]> => {
    const prompts = await getPromptDefinitions();
    const master = prompts.find((m) => m.isMaster);

    return prompts.map((prompt) => ({
        content: prompt.isMaster || !master ? prompt.content : stackPrompts(master.content, prompt.content),
        id: prompt.id,
        name: prompt.name,
    }));
};

export const getSelectedPrompt = async (): Promise<PromptSelection> => {
    const snapshot = await getCompilationSnapshot();
    return resolvePromptSelection({ promptForTranslation: snapshot.promptForTranslation, promptId: snapshot.promptId });
};

export const getSelectedPromptId = async (): Promise<string> => {
    const selectedPrompt = await getSelectedPrompt();
    return selectedPrompt.id;
};

export const setSelectedPromptById = async (promptId: string): Promise<PromptSelection | null> => {
    const selectedPrompt = await getPromptOptionById(promptId);
    if (!selectedPrompt) {
        return null;
    }

    const writeOperation = promptWriteQueue.then(async () => {
        await writeCompilationPromptSelection(selectedPrompt);
    });

    promptWriteQueue = writeOperation.catch(() => undefined);
    await writeOperation;

    return selectedPrompt;
};

export const setSelectedPrompt = async ({
    content,
    promptId,
}: {
    content: string;
    promptId: string;
}): Promise<PromptSelection | null> => {
    const selectedPrompt = await getPromptOptionById(promptId);
    if (!selectedPrompt) {
        return null;
    }

    const nextPrompt = { ...selectedPrompt, content };

    const writeOperation = promptWriteQueue.then(async () => {
        await writeCompilationPromptSelection(nextPrompt);
    });

    promptWriteQueue = writeOperation.catch(() => undefined);
    await writeOperation;

    return nextPrompt;
};

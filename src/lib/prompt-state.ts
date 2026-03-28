import { createReadStream, renameSync, rmSync, statSync } from 'node:fs';
import { join, parse } from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { parser } from 'stream-json';
import pick from 'stream-json/filters/pick.js';
import streamValues from 'stream-json/streamers/stream-values.js';
import { requireCompilationFilePath } from '@/lib/data-paths';
import type { Compilation } from '@/types/compilation';

const PROMPTS_DIR = 'prompts';

export type PromptOption = { id: string; name: string; content: string; isMaster?: boolean };

type PromptSelection = { content: string; id: string; name: string };
type CompilationPromptState = {
    filePath: string;
    mtimeMs: number;
    promptForTranslation: string;
    promptId: string | null;
};

let compilationPromptStateCache: CompilationPromptState | null = null;
let compilationPromptStatePromise: Promise<CompilationPromptState> | null = null;
let promptOptionsPromise: Promise<PromptOption[]> | null = null;
let promptWriteQueue = Promise.resolve();

const mapFileNameToDisplayName = (filename: string) => {
    // encyclopedia_mixed.md -> Encyclopedia Mixed
    return filename
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
};

const mapFileNametoId = (filename: string) => {
    // encyclopedia_mixed.md -> ENCYCLOPEDIA_MIXED
    return filename.toUpperCase().replace(/-/g, '_');
};

const stackPrompts = (master: string, addon: string) => {
    return `${master.trim()}\n${addon.trim()}`;
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

const getBunRuntime = () => {
    const bunRuntime = (
        globalThis as unknown as {
            Bun?: {
                Glob: new (pattern: string) => { scan: (options: { cwd: string }) => AsyncIterable<string> };
                file: (target: string) => {
                    json: () => Promise<unknown>;
                    text: () => Promise<string>;
                    stream: () => ReadableStream<Uint8Array>;
                };
                write: (target: string, data: string) => Promise<number>;
            };
        }
    ).Bun;

    if (!bunRuntime) {
        throw new Error('Bun runtime is required.');
    }

    return bunRuntime;
};

const getInputStream = (filePath: string): Readable => {
    const bunStream = getBunFileStream(filePath);
    if (bunStream) {
        return bunStream;
    }

    return createReadStream(filePath);
};

const loadTopLevelString = async (filePath: string, key: 'promptForTranslation' | 'promptId'): Promise<string> => {
    const valueStream = getInputStream(filePath)
        .pipe(parser.asStream())
        .pipe(pick.asStream({ filter: key }))
        .pipe(streamValues.asStream());

    for await (const entry of valueStream as AsyncIterable<{ key: number; value: unknown }>) {
        if (typeof entry.value === 'string') {
            return entry.value;
        }
    }

    return '';
};

const loadPrompts = async () => {
    const bunRuntime = getBunRuntime();
    const files: string[] = [];
    for await (const filePath of new bunRuntime.Glob('*.md').scan({ cwd: PROMPTS_DIR })) {
        files.push(filePath);
    }

    const result: PromptOption[] = [];

    for (const f of files) {
        const { name } = parse(f);
        const content = await bunRuntime.file(join(PROMPTS_DIR, f)).text();

        result.push({
            content,
            id: mapFileNametoId(name),
            ...(name === 'master' && { isMaster: true }),
            name: mapFileNameToDisplayName(name),
        });
    }

    return result;
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

const loadCompilationPromptState = async (filePath: string, mtimeMs: number): Promise<CompilationPromptState> => {
    const [promptForTranslation, promptId] = await Promise.all([
        loadTopLevelString(filePath, 'promptForTranslation'),
        loadTopLevelString(filePath, 'promptId'),
    ]);

    return { filePath, mtimeMs, promptForTranslation, promptId: promptId.trim() || null };
};

const getCompilationPromptState = async (): Promise<CompilationPromptState> => {
    const filePath = requireCompilationFilePath();
    const mtimeMs = statSync(filePath).mtimeMs;

    if (
        compilationPromptStateCache &&
        compilationPromptStateCache.filePath === filePath &&
        compilationPromptStateCache.mtimeMs === mtimeMs
    ) {
        return compilationPromptStateCache;
    }

    if (!compilationPromptStatePromise) {
        compilationPromptStatePromise = loadCompilationPromptState(filePath, mtimeMs)
            .then((state) => {
                compilationPromptStateCache = state;
                return state;
            })
            .finally(() => {
                compilationPromptStatePromise = null;
            });
    }

    return compilationPromptStatePromise;
};

const resolvePromptSelection = async (state: CompilationPromptState): Promise<PromptSelection> => {
    const resolvedContent = state.promptForTranslation.trim();

    if (state.promptId) {
        const selectedById = await getPromptOptionById(state.promptId);
        if (selectedById) {
            return { ...selectedById, content: resolvedContent || selectedById.content };
        }
    }

    const selectedByContent = await getPromptOptionByContent(state.promptForTranslation);
    if (selectedByContent) {
        return { ...selectedByContent, content: resolvedContent || selectedByContent.content };
    }

    const defaultPrompt = await getDefaultPromptOption();
    return { ...defaultPrompt, content: resolvedContent || defaultPrompt.content };
};

const writeCompilationPromptSelection = async (selectedPrompt: PromptSelection): Promise<void> => {
    const bunRuntime = getBunRuntime();
    const filePath = requireCompilationFilePath();
    const compilation = (await bunRuntime.file(filePath).json()) as Compilation;

    compilation.lastUpdatedAt = Date.now();
    compilation.promptForTranslation = selectedPrompt.content;
    compilation.promptId = selectedPrompt.id;

    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

    try {
        await bunRuntime.write(tempPath, `${JSON.stringify(compilation)}\n`);
        renameSync(tempPath, filePath);
        const mtimeMs = statSync(filePath).mtimeMs;
        compilationPromptStateCache = {
            filePath,
            mtimeMs,
            promptForTranslation: selectedPrompt.content,
            promptId: selectedPrompt.id,
        };
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
    const state = await getCompilationPromptState();
    return await resolvePromptSelection(state);
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

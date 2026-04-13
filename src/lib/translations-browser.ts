import '@tanstack/react-start/server-only';

import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

import { MissingPathConfigError, requireCompilationFilePath, requireTranslationsDir } from '@/lib/data-paths';
import { perfLog, withPerfSpan } from '@/lib/perf-log';
import { getThinkingTimeRange } from '@/lib/reasoning-time';
import { fileExists, getFileSizeBytes, readTextFile, writeTextFile } from '@/lib/runtime-files';
import type { InvalidExcerptsResponse, JsonValue, TranslationFileResponse } from '@/lib/shell-types';
import { getTranslationFileAnalyses, invalidateTranslationFileAnalysisCache } from './translation-analysis-cache';
import { getConversationSourceSegments, parseTranslationToCommon } from './translation-parser';
import {
    isRupturePatchMetadata,
    normalizeRupturePatchesForSegments,
    type RupturePatch,
    type RupturePatchMetadata,
} from './translation-patches';
import { parseTranslationsInOrder } from './validation/textUtils';

export type TranslationTreeNode = {
    kind: 'directory' | 'file';
    name: string;
    relativePath: string;
    children?: TranslationTreeNode[];
};

export type TranslationTreeResponse = { rootName: string; rootRelativePath: ''; entries: TranslationTreeNode[] };

type CachedTree = { filePaths: string[]; rootDirectory: string; tree: TranslationTreeResponse };

let cachedTree: CachedTree | null = null;

const normalizeRelativePath = (rawPath: string): string => {
    const normalized = path.posix.normalize(rawPath.replaceAll('\\', '/'));
    if (normalized === '.' || normalized === '') {
        throw new Error('A file path is required.');
    }
    if (path.posix.isAbsolute(normalized) || normalized.startsWith('../') || normalized.includes('/../')) {
        throw new Error('Invalid file path.');
    }
    return normalized;
};

const assertPathInsideRoot = (rootDirectory: string, targetPath: string): void => {
    const resolvedRoot = path.resolve(rootDirectory);
    const resolvedTarget = path.resolve(targetPath);

    if (resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
        return;
    }

    throw new Error('Invalid file path.');
};

const readDirectoryTree = async (
    currentDirectory: string,
    currentRelativePath: string,
): Promise<TranslationTreeNode[]> => {
    const directoryEntries = await readdir(currentDirectory, { withFileTypes: true });

    const directories = directoryEntries
        .filter((entry) => entry.isDirectory())
        .sort((left, right) => left.name.localeCompare(right.name));

    const files = directoryEntries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .sort((left, right) => left.name.localeCompare(right.name));

    const output: TranslationTreeNode[] = [];

    for (const directory of directories) {
        const childAbsolutePath = path.join(currentDirectory, directory.name);
        const childRelativePath = currentRelativePath ? `${currentRelativePath}/${directory.name}` : directory.name;
        output.push({
            children: await readDirectoryTree(childAbsolutePath, childRelativePath),
            kind: 'directory',
            name: directory.name,
            relativePath: childRelativePath,
        });
    }

    for (const fileEntry of files) {
        const fileRelativePath = currentRelativePath ? `${currentRelativePath}/${fileEntry.name}` : fileEntry.name;
        output.push({ kind: 'file', name: fileEntry.name, relativePath: fileRelativePath });
    }

    return output;
};

const flattenTranslationTreeFilePaths = (nodes: TranslationTreeNode[]): string[] =>
    nodes.flatMap((node) =>
        node.kind === 'file' ? [node.relativePath] : flattenTranslationTreeFilePaths(node.children ?? []),
    );

export const invalidateTranslationTreeCache = (rootDirectory?: string) => {
    if (!rootDirectory || !cachedTree || cachedTree.rootDirectory === rootDirectory) {
        cachedTree = null;
    }
};

export const getTranslationTree = async (): Promise<TranslationTreeResponse> => {
    return withPerfSpan('translations-browser', 'get_translation_tree', async () => {
        const translationsDirectory = requireTranslationsDir();

        if (cachedTree && cachedTree.rootDirectory === translationsDirectory) {
            perfLog('translations-browser', 'tree_cache_hit', {
                fileCount: cachedTree.filePaths.length,
                rootDirectory: translationsDirectory,
            });
            return cachedTree.tree;
        }

        perfLog('translations-browser', 'tree_cache_miss', { rootDirectory: translationsDirectory });
        const rootName = path.basename(translationsDirectory);
        const entries = await readDirectoryTree(translationsDirectory, '');
        const nextTree: TranslationTreeResponse = { entries, rootName, rootRelativePath: '' };
        const filePaths = flattenTranslationTreeFilePaths(entries);

        cachedTree = { filePaths, rootDirectory: translationsDirectory, tree: nextTree };

        return nextTree;
    });
};

export const readTranslationJsonFile = async (rawRelativePath: string): Promise<TranslationFileResponse> => {
    const translationsDirectory = requireTranslationsDir();
    const relativePath = normalizeRelativePath(rawRelativePath);

    if (!relativePath.endsWith('.json')) {
        throw new Error('Only .json files are supported.');
    }

    const absolutePath = path.join(translationsDirectory, relativePath);
    assertPathInsideRoot(translationsDirectory, absolutePath);

    const fileStats = await stat(absolutePath);
    if (!fileStats.isFile()) {
        throw new Error('File not found.');
    }

    const content = await readTextFile(absolutePath);
    const parsedJson = JSON.parse(content) as JsonValue;
    const sizeBytes = await getFileSizeBytes(absolutePath);

    return {
        content: parsedJson,
        modifiedAt: fileStats.mtime.toISOString(),
        name: path.basename(absolutePath),
        relativePath,
        sizeBytes,
    };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const getNextSkippedExcerptIds = (
    currentSkip: unknown,
    excerptId: string,
    skipped: boolean,
    validExcerptIds: Set<string>,
) => {
    const nextSkippedIds = new Set<string>();

    if (Array.isArray(currentSkip)) {
        for (const value of currentSkip) {
            if (typeof value === 'string' && validExcerptIds.has(value)) {
                nextSkippedIds.add(value);
            }
        }
    }

    if (skipped) {
        nextSkippedIds.add(excerptId);
    } else {
        nextSkippedIds.delete(excerptId);
    }

    return [...nextSkippedIds].sort();
};

const getNextPatchMetadata = (
    currentPatchMetadata: unknown,
    nextPatches: Record<string, RupturePatch>,
    excerptId: string,
    patch: RupturePatch | null,
    patchMetadata?: RupturePatchMetadata,
) => {
    const nextPatchMetadata: Record<string, RupturePatchMetadata> = {};

    for (const [key, value] of Object.entries(isRecord(currentPatchMetadata) ? currentPatchMetadata : {})) {
        if (key in nextPatches && isRupturePatchMetadata(value)) {
            nextPatchMetadata[key] = value;
        }
    }

    if (patch && patchMetadata) {
        nextPatchMetadata[excerptId] = patchMetadata;
    } else {
        delete nextPatchMetadata[excerptId];
    }

    return nextPatchMetadata;
};

const setRuptureMetadata = (
    nextContent: Record<string, unknown>,
    nextRupture: Record<string, unknown>,
    nextPatches: Record<string, RupturePatch>,
    nextPatchMetadata: Record<string, RupturePatchMetadata>,
) => {
    if (Object.keys(nextPatches).length > 0) {
        nextRupture.patches = nextPatches;
        if (Object.keys(nextPatchMetadata).length > 0) {
            nextRupture.patchMetadata = nextPatchMetadata;
        } else {
            delete nextRupture.patchMetadata;
        }
        nextContent.__rupture = nextRupture;
        return;
    }

    delete nextRupture.patches;
    delete nextRupture.patchMetadata;
    if (Object.keys(nextRupture).length > 0) {
        nextContent.__rupture = nextRupture;
    } else {
        delete nextContent.__rupture;
    }
};

export const writeTranslationPatch = async (
    rawRelativePath: string,
    excerptId: string,
    patch: RupturePatch | null,
    patchMetadata?: RupturePatchMetadata,
) => {
    const translationsDir = requireTranslationsDir();
    const relativePath = normalizeRelativePath(rawRelativePath);

    if (!relativePath.endsWith('.json')) {
        throw new Error('Only .json files are supported.');
    }

    const absolutePath = path.join(translationsDir, relativePath);
    assertPathInsideRoot(translationsDir, absolutePath);

    if (!(await fileExists(absolutePath))) {
        throw new Error('File not found.');
    }

    const content = await readTextFile(absolutePath);
    const parsedJson = JSON.parse(content) as unknown;
    if (!isRecord(parsedJson)) {
        throw new Error('Translation file must be a JSON object.');
    }

    const conversation = parseTranslationToCommon(parsedJson);
    const baseTranslatedSegments = parseTranslationsInOrder(conversation.response);
    const sourceSegments = getConversationSourceSegments(conversation);
    const patchTargetSegments = sourceSegments.map((segment) => ({
        id: segment.id,
        text: baseTranslatedSegments.find((translated) => translated.id === segment.id)?.text ?? '',
    }));
    if (!patchTargetSegments.some((segment) => segment.id === excerptId)) {
        throw new Error('Excerpt not found.');
    }

    const nextContent = { ...parsedJson };
    const nextRupture = isRecord(nextContent.__rupture) ? { ...nextContent.__rupture } : {};
    const rawNextPatches = { ...(normalizeRupturePatchesForSegments(patchTargetSegments, nextRupture.patches) ?? {}) };

    if (patch) {
        rawNextPatches[excerptId] = patch;
    } else {
        delete rawNextPatches[excerptId];
    }

    const nextPatches = normalizeRupturePatchesForSegments(patchTargetSegments, rawNextPatches) ?? {};
    const nextPatchMetadata = getNextPatchMetadata(
        nextRupture.patchMetadata,
        nextPatches,
        excerptId,
        patch,
        patchMetadata,
    );

    setRuptureMetadata(nextContent, nextRupture, nextPatches, nextPatchMetadata);

    const tempPath = `${absolutePath}.${randomUUID()}.tmp`;
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeTextFile(tempPath, `${JSON.stringify(nextContent, null, 2)}\n`);
    await rename(tempPath, absolutePath);
    invalidateTranslationFileAnalysisCache(translationsDir, relativePath);

    return readTranslationJsonFile(relativePath);
};

export const writeTranslationSkip = async (rawRelativePath: string, excerptId: string, skipped: boolean) => {
    const translationsDir = requireTranslationsDir();
    const relativePath = normalizeRelativePath(rawRelativePath);

    if (!relativePath.endsWith('.json')) {
        throw new Error('Only .json files are supported.');
    }

    const absolutePath = path.join(translationsDir, relativePath);
    assertPathInsideRoot(translationsDir, absolutePath);

    if (!(await fileExists(absolutePath))) {
        throw new Error('File not found.');
    }

    const content = await readTextFile(absolutePath);
    const parsedJson = JSON.parse(content) as unknown;
    if (!isRecord(parsedJson)) {
        throw new Error('Translation file must be a JSON object.');
    }

    const conversation = parseTranslationToCommon(parsedJson);
    const sourceIds = new Set(getConversationSourceSegments(conversation).map((segment) => segment.id));
    if (!sourceIds.has(excerptId)) {
        throw new Error('Excerpt not found.');
    }

    const nextContent = { ...parsedJson };
    const nextRupture = isRecord(nextContent.__rupture) ? { ...nextContent.__rupture } : {};
    const nextSkippedIds = getNextSkippedExcerptIds(nextRupture.skip, excerptId, skipped, sourceIds);

    if (nextSkippedIds.length > 0) {
        nextRupture.skip = nextSkippedIds;
        nextContent.__rupture = nextRupture;
    } else {
        delete nextRupture.skip;
        if (Object.keys(nextRupture).length > 0) {
            nextContent.__rupture = nextRupture;
        } else {
            delete nextContent.__rupture;
        }
    }

    const tempPath = `${absolutePath}.${randomUUID()}.tmp`;
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeTextFile(tempPath, `${JSON.stringify(nextContent, null, 2)}\n`);
    await rename(tempPath, absolutePath);
    invalidateTranslationFileAnalysisCache(translationsDir, relativePath);

    return readTranslationJsonFile(relativePath);
};

export const deleteTranslationJsonFile = async (rawRelativePath: string) => {
    const translationsDirectory = requireTranslationsDir();
    const relativePath = normalizeRelativePath(rawRelativePath);

    if (!relativePath.endsWith('.json')) {
        throw new Error('Only .json files are supported.');
    }

    const absolutePath = path.join(translationsDirectory, relativePath);
    assertPathInsideRoot(translationsDirectory, absolutePath);

    await unlink(absolutePath);
    invalidateTranslationTreeCache(translationsDirectory);
    invalidateTranslationFileAnalysisCache(translationsDirectory, relativePath);
};

const countFiles = (nodes: TranslationTreeNode[]): number => {
    let count = 0;
    for (const node of nodes) {
        if (node.kind === 'file') {
            count += 1;
            continue;
        }
        if (node.children?.length) {
            count += countFiles(node.children);
        }
    }
    return count;
};

export const getDashboardStats = async () => {
    const checkedAt = new Date().toISOString();
    let translationsDirectoryConfigured = true;
    let translationsDirectoryExists = true;
    let translationFilesCount = 0;
    let translationsDirectoryName = 'translations';
    let translationsDirectoryPath: string | null = null;

    try {
        translationsDirectoryPath = requireTranslationsDir();
        const translationTree = await getTranslationTree();
        translationFilesCount = countFiles(translationTree.entries);
        translationsDirectoryName = translationTree.rootName;
    } catch (error) {
        if (error instanceof MissingPathConfigError) {
            translationsDirectoryConfigured = false;
            translationsDirectoryExists = false;
            translationsDirectoryPath = null;
        } else {
            translationsDirectoryExists = false;
        }
    }

    let compilationFileConfigured = true;
    let compilationFileExists = true;
    let compilationFilePath: string | null = null;

    try {
        compilationFilePath = requireCompilationFilePath();
        await stat(compilationFilePath);
    } catch (error) {
        if (error instanceof MissingPathConfigError) {
            compilationFileConfigured = false;
            compilationFileExists = false;
            compilationFilePath = null;
        } else {
            compilationFileExists = false;
        }
    }

    return {
        checkedAt,
        health: {
            compilationFileConfigured,
            compilationFileExists,
            compilationFilePath,
            ok:
                compilationFileConfigured &&
                compilationFileExists &&
                translationsDirectoryConfigured &&
                translationsDirectoryExists,
            translationsDirectoryConfigured,
            translationsDirectoryExists,
            translationsDirectoryPath,
        },
        stats: { port: process.env.PORT?.trim() || '9000', translationFilesCount, translationsDirectoryName },
    };
};

export type TranslationFileStats = {
    isValid: boolean;
    model: string | undefined;
    patchesApplied: number;
    path: string;
    reasoningDurationSec: number | undefined;
};

export type TranslationStats = {
    totalFiles: number;
    validFiles: number;
    invalidFiles: number;
    files: TranslationFileStats[];
    modelBreakdown: Record<string, number>;
    invalidByModel: Record<string, number>;
    patchesApplied: number;
    thinkingTimeBreakdown: Record<'10_to_30s' | '1m_plus' | '30_to_60s' | 'lt_10s', number>;
};

export const collectTranslationFilePaths = async (
    currentDirectory: string,
    currentRelativePath: string,
): Promise<string[]> => {
    return withPerfSpan(
        'translations-browser',
        'collect_translation_file_paths',
        async () => {
            const cachedRootFilePaths = await getCachedRootFilePaths(currentDirectory, currentRelativePath);
            if (cachedRootFilePaths) {
                perfLog('translations-browser', 'collect_paths_cache_hit', {
                    currentDirectory,
                    currentRelativePath,
                    fileCount: cachedRootFilePaths.length,
                });
                return cachedRootFilePaths;
            }

            const files: string[] = [];
            const directoryEntries = await readdir(currentDirectory, { withFileTypes: true });

            for (const entry of directoryEntries) {
                const fullPath = path.join(currentDirectory, entry.name);
                const relativePath = currentRelativePath ? `${currentRelativePath}/${entry.name}` : entry.name;

                if (entry.isDirectory()) {
                    files.push(...(await collectTranslationFilePaths(fullPath, relativePath)));
                } else if (entry.isFile() && entry.name.endsWith('.json')) {
                    files.push(relativePath);
                }
            }

            return files;
        },
        { currentDirectory, currentRelativePath },
    );
};

const getCachedRootFilePaths = async (
    currentDirectory: string,
    currentRelativePath: string,
): Promise<string[] | null> => {
    if (currentRelativePath) {
        return null;
    }

    const translationsDirectory = requireTranslationsDir();
    if (path.resolve(currentDirectory) !== path.resolve(translationsDirectory)) {
        return null;
    }

    if (cachedTree && cachedTree.rootDirectory === translationsDirectory) {
        return cachedTree.filePaths;
    }

    await getTranslationTree();
    return cachedTree?.filePaths ?? [];
};

export const getTranslationStats = async (): Promise<TranslationStats> => {
    return withPerfSpan('translations-browser', 'get_translation_stats', async () => {
        const translationsDir = requireTranslationsDir();
        const filePaths = await collectTranslationFilePaths(translationsDir, '');
        const analyses = await getTranslationFileAnalyses(translationsDir, filePaths);

        return summarizeTranslationStats(
            analyses.map((analysis) => ({
                isValid: analysis.isValid,
                model: analysis.model,
                patchesApplied: analysis.patchesApplied,
                path: analysis.path,
                reasoningDurationSec: analysis.reasoningDurationSec,
            })),
        );
    });
};

export const summarizeTranslationStats = (files: TranslationFileStats[]): TranslationStats => {
    const modelBreakdown: Record<string, number> = {};
    const invalidByModel: Record<string, number> = {};
    const thinkingTimeBreakdown = { '1m_plus': 0, '10_to_30s': 0, '30_to_60s': 0, lt_10s: 0 };
    let patchesApplied = 0;

    for (const file of files) {
        patchesApplied += file.patchesApplied;
        const thinkingTimeRange = getThinkingTimeRange(file.reasoningDurationSec);
        if (thinkingTimeRange) {
            thinkingTimeBreakdown[thinkingTimeRange] += 1;
        }

        if (!file.model) {
            if (!file.isValid) {
                invalidByModel.unknown = (invalidByModel.unknown || 0) + 1;
            }
            continue;
        }

        modelBreakdown[file.model] = (modelBreakdown[file.model] || 0) + 1;
        if (!file.isValid) {
            invalidByModel[file.model] = (invalidByModel[file.model] || 0) + 1;
        }
    }

    return {
        files,
        invalidByModel,
        invalidFiles: files.filter((f) => !f.isValid).length,
        modelBreakdown,
        patchesApplied,
        thinkingTimeBreakdown,
        totalFiles: files.length,
        validFiles: files.filter((f) => f.isValid).length,
    };
};

export const getInvalidExcerpts = async (): Promise<InvalidExcerptsResponse> => {
    return withPerfSpan('translations-browser', 'get_invalid_excerpts', async () => {
        const translationsDir = requireTranslationsDir();
        const filePaths = await collectTranslationFilePaths(translationsDir, '');
        const analyses = await getTranslationFileAnalyses(translationsDir, filePaths);
        const rows = analyses.flatMap((analysis) => analysis.invalidRows);
        const invalidFileCount = analyses.filter((analysis) => analysis.invalidRows.length > 0).length;

        return { invalidFileCount, rowCount: rows.length, rows };
    });
};

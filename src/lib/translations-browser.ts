import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { MissingPathConfigError, requireCompilationFilePath, requireTranslationsDir } from '@/lib/data-paths';
import { mapConversationToExcerpts, parseTranslationToCommon } from './translation-parser';

export type TranslationTreeNode = {
    kind: 'directory' | 'file';
    name: string;
    relativePath: string;
    children?: TranslationTreeNode[];
};

export type TranslationTreeResponse = { rootName: string; rootRelativePath: ''; entries: TranslationTreeNode[] };

type CachedTree = { directoryMtimeMs: number; tree: TranslationTreeResponse };

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

const getLatestTreeMtimeMs = async (currentDirectory: string): Promise<number> => {
    const directoryStats = await stat(currentDirectory);
    let latestMtimeMs = directoryStats.mtimeMs;
    const directoryEntries = await readdir(currentDirectory, { withFileTypes: true });

    for (const entry of directoryEntries) {
        const entryPath = path.join(currentDirectory, entry.name);

        if (entry.isDirectory()) {
            const childLatestMtimeMs = await getLatestTreeMtimeMs(entryPath);
            if (childLatestMtimeMs > latestMtimeMs) {
                latestMtimeMs = childLatestMtimeMs;
            }
            continue;
        }

        if (!entry.isFile()) {
            continue;
        }

        const entryStats = await stat(entryPath);
        if (entryStats.mtimeMs > latestMtimeMs) {
            latestMtimeMs = entryStats.mtimeMs;
        }
    }

    return latestMtimeMs;
};

export const getTranslationTree = async (): Promise<TranslationTreeResponse> => {
    const translationsDirectory = requireTranslationsDir();
    const directoryMtimeMs = await getLatestTreeMtimeMs(translationsDirectory);

    if (cachedTree && cachedTree.directoryMtimeMs === directoryMtimeMs) {
        return cachedTree.tree;
    }

    const rootName = path.basename(translationsDirectory);
    const entries = await readDirectoryTree(translationsDirectory, '');
    const nextTree: TranslationTreeResponse = { entries, rootName, rootRelativePath: '' };

    cachedTree = { directoryMtimeMs, tree: nextTree };

    return nextTree;
};

export const readTranslationJsonFile = async (rawRelativePath: string) => {
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

    const file = Bun.file(absolutePath);
    const content = await file.text();
    const parsedJson = JSON.parse(content) as unknown;

    return {
        content: parsedJson,
        modifiedAt: fileStats.mtime.toISOString(),
        name: path.basename(absolutePath),
        relativePath,
        sizeBytes: file.size,
    };
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

    try {
        const translationTree = await getTranslationTree();
        translationFilesCount = countFiles(translationTree.entries);
        translationsDirectoryName = translationTree.rootName;
    } catch (error) {
        if (error instanceof MissingPathConfigError) {
            translationsDirectoryConfigured = false;
            translationsDirectoryExists = false;
        } else {
            translationsDirectoryExists = false;
        }
    }

    let compilationFileConfigured = true;
    let compilationFileExists = true;

    try {
        const compilationFilePath = requireCompilationFilePath();
        await stat(compilationFilePath);
    } catch (error) {
        if (error instanceof MissingPathConfigError) {
            compilationFileConfigured = false;
            compilationFileExists = false;
        } else {
            compilationFileExists = false;
        }
    }

    return {
        checkedAt,
        health: {
            compilationFileConfigured,
            compilationFileExists,
            ok:
                compilationFileConfigured &&
                compilationFileExists &&
                translationsDirectoryConfigured &&
                translationsDirectoryExists,
            translationsDirectoryConfigured,
            translationsDirectoryExists,
        },
        stats: { port: process.env.PORT?.trim() || '9000', translationFilesCount, translationsDirectoryName },
    };
};

export type TranslationFileStats = { path: string; model: string | undefined; isValid: boolean };

export type TranslationStats = {
    totalFiles: number;
    validFiles: number;
    invalidFiles: number;
    files: TranslationFileStats[];
    modelBreakdown: Record<string, number>;
    invalidByModel: Record<string, number>;
};

const collectAllFiles = async (currentDirectory: string, currentRelativePath: string): Promise<string[]> => {
    const files: string[] = [];
    const directoryEntries = await readdir(currentDirectory, { withFileTypes: true });

    for (const entry of directoryEntries) {
        const fullPath = path.join(currentDirectory, entry.name);
        const relativePath = currentRelativePath ? `${currentRelativePath}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
            files.push(...(await collectAllFiles(fullPath, relativePath)));
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
            files.push(relativePath);
        }
    }

    return files;
};

export const getTranslationStats = async (): Promise<TranslationStats> => {
    const translationsDir = requireTranslationsDir();
    const filePaths = await collectAllFiles(translationsDir, '');

    const files: TranslationFileStats[] = [];
    const modelBreakdown: Record<string, number> = {};
    const invalidByModel: Record<string, number> = {};

    for (const filePath of filePaths) {
        try {
            const fullPath = path.join(translationsDir, filePath);
            const content = await readFile(fullPath, 'utf8');
            const parsed = parseTranslationToCommon(JSON.parse(content));
            const excerpts = mapConversationToExcerpts(parsed);
            const isValid = excerpts.length > 0;
            const model = parsed.model;

            files.push({ isValid, model, path: filePath });

            // Count models
            if (model) {
                modelBreakdown[model] = (modelBreakdown[model] || 0) + 1;
                if (!isValid) {
                    invalidByModel[model] = (invalidByModel[model] || 0) + 1;
                }
            }
        } catch {
            // If parsing fails, mark as invalid with unknown model
            files.push({ isValid: false, model: undefined, path: filePath });
            invalidByModel.unknown = (invalidByModel.unknown || 0) + 1;
        }
    }

    const validFiles = files.filter((f) => f.isValid).length;
    const invalidFiles = files.filter((f) => !f.isValid).length;

    return { files, invalidByModel, invalidFiles, modelBreakdown, totalFiles: filePaths.length, validFiles };
};

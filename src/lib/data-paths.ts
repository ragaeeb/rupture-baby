import '@tanstack/react-start/server-only';

import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { fileExists, readJsonFile, writeTextFile } from '@/lib/runtime-files';

type PathConfigKey = 'activeCompilation' | 'compilationFolder' | 'translationsDir';

type ActiveCompilationConfigFile = { fileName?: unknown; version?: unknown };

export type CompilationFileOption = { fileName: string; filePath: string; modifiedAt: string; sizeBytes: number };

const ACTIVE_COMPILATION_CONFIG_NAME = '.active-compilation.json';

export class MissingPathConfigError extends Error {
    key: PathConfigKey;

    constructor(key: PathConfigKey, message?: string) {
        super(message ?? `${key} is not set on the server.`);
        this.name = 'MissingPathConfigError';
        this.key = key;
    }
}

const getCompilationFolderFromEnv = () => process.env.COMPILATION_FOLDER?.trim() || null;
const getTranslationsDirFromEnv = () => process.env.TRANSLATIONS_DIR?.trim() || null;

const isCompilationCandidateFileName = (fileName: string) => fileName.endsWith('.json') && !fileName.startsWith('.');

export const getActiveCompilationConfigPath = (compilationFolder: string) =>
    path.join(compilationFolder, ACTIVE_COMPILATION_CONFIG_NAME);

export const requireCompilationFolder = (): string => {
    const compilationFolder = getCompilationFolderFromEnv();
    if (!compilationFolder) {
        throw new MissingPathConfigError('compilationFolder');
    }

    return compilationFolder;
};

export const listCompilationFileOptions = async (
    compilationFolder = requireCompilationFolder(),
): Promise<CompilationFileOption[]> => {
    const directoryEntries = await readdir(compilationFolder, { withFileTypes: true });
    const candidateEntries = directoryEntries
        .filter((entry) => entry.isFile() && isCompilationCandidateFileName(entry.name))
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }));

    return Promise.all(
        candidateEntries.map(async (entry) => {
            const filePath = path.join(compilationFolder, entry.name);
            const fileStats = await stat(filePath);

            return {
                fileName: entry.name,
                filePath,
                modifiedAt: fileStats.mtime.toISOString(),
                sizeBytes: fileStats.size,
            };
        }),
    );
};

const readStoredActiveCompilationFileName = async (compilationFolder: string): Promise<string | null> => {
    const configPath = getActiveCompilationConfigPath(compilationFolder);
    if (!(await fileExists(configPath))) {
        return null;
    }

    try {
        const config = await readJsonFile<ActiveCompilationConfigFile>(configPath);
        return typeof config.fileName === 'string' && isCompilationCandidateFileName(config.fileName)
            ? config.fileName
            : null;
    } catch {
        return null;
    }
};

const writeStoredActiveCompilationFileName = async (compilationFolder: string, fileName: string) => {
    const configPath = getActiveCompilationConfigPath(compilationFolder);
    await writeTextFile(configPath, `${JSON.stringify({ fileName, version: 1 }, null, 2)}\n`);
};

export const requireCompilationFilePath = async (): Promise<string> => {
    const compilationFolder = requireCompilationFolder();
    const [options, storedFileName] = await Promise.all([
        listCompilationFileOptions(compilationFolder),
        readStoredActiveCompilationFileName(compilationFolder),
    ]);

    if (options.length === 0) {
        throw new MissingPathConfigError(
            'activeCompilation',
            `No visible compilation .json files were found in COMPILATION_FOLDER (${compilationFolder}).`,
        );
    }

    const activeOption = options.find((option) => option.fileName === storedFileName) ?? options[0];
    if (storedFileName !== activeOption.fileName) {
        await writeStoredActiveCompilationFileName(compilationFolder, activeOption.fileName);
    }

    return activeOption.filePath;
};

export const setActiveCompilationFileName = async (fileName: string): Promise<CompilationFileOption> => {
    const normalizedFileName = fileName.trim();
    if (!isCompilationCandidateFileName(normalizedFileName)) {
        throw new Error('Invalid compilation file name.');
    }

    const compilationFolder = requireCompilationFolder();
    const options = await listCompilationFileOptions(compilationFolder);
    const matchingOption = options.find((option) => option.fileName === normalizedFileName);

    if (!matchingOption) {
        throw new Error(`Compilation "${normalizedFileName}" was not found in ${compilationFolder}.`);
    }

    await writeStoredActiveCompilationFileName(compilationFolder, matchingOption.fileName);
    return matchingOption;
};

export const requireTranslationsDir = (): string => {
    const translationsDir = getTranslationsDirFromEnv();
    if (!translationsDir) {
        throw new MissingPathConfigError('translationsDir');
    }
    return translationsDir;
};

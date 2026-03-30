import '@tanstack/react-start/server-only';

import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

import { MissingPathConfigError, requireCompilationFilePath, requireTranslationsDir } from '@/lib/data-paths';
import { getThinkingTimeRange } from '@/lib/reasoning-time';
import { fileExists, getFileSizeBytes, readTextFile, writeTextFile } from '@/lib/runtime-files';
import type { InvalidExcerptRow, InvalidExcerptsResponse, JsonValue, TranslationFileResponse } from '@/lib/shell-types';
import { getConversationSourceSegments, parseTranslationToCommon } from './translation-parser';
import {
    isRupturePatchMetadata,
    normalizeRupturePatchesForSegments,
    type RupturePatch,
    type RupturePatchMetadata,
} from './translation-patches';
import {
    analyzeTranslationValidity,
    getVisibleTranslationValidityErrors,
    isTranslationValidityAnalysisInvalid,
} from './translation-validity';
import { parseTranslationsInOrder } from './validation/textUtils';
import type { Range, ValidationErrorType } from './validation/types';

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
};

export const getTranslationStats = async (): Promise<TranslationStats> => {
    const translationsDir = requireTranslationsDir();
    const filePaths = await collectTranslationFilePaths(translationsDir, '');

    const files: TranslationFileStats[] = [];
    const modelBreakdown: Record<string, number> = {};
    const invalidByModel: Record<string, number> = {};

    for (const filePath of filePaths) {
        try {
            const fullPath = path.join(translationsDir, filePath);
            const content = await readTextFile(fullPath);
            const analysis = analyzeTranslationValidity(content);
            const isValid = !isTranslationValidityAnalysisInvalid(analysis);
            files.push({
                isValid,
                model: analysis.model,
                patchesApplied: analysis.patchedExcerptIds.size,
                path: filePath,
                reasoningDurationSec: analysis.parsed.reasoning_duration_sec,
            });

            // Count models
            if (analysis.model) {
                modelBreakdown[analysis.model] = (modelBreakdown[analysis.model] || 0) + 1;
                if (!isValid) {
                    invalidByModel[analysis.model] = (invalidByModel[analysis.model] || 0) + 1;
                }
            }
        } catch {
            // If parsing fails, mark as invalid with unknown model
            files.push({
                isValid: false,
                model: undefined,
                patchesApplied: 0,
                path: filePath,
                reasoningDurationSec: undefined,
            });
            invalidByModel.unknown = (invalidByModel.unknown || 0) + 1;
        }
    }

    return summarizeTranslationStats(files);
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

const buildInvalidExcerptRowsForFile = (filePath: string, content: string): InvalidExcerptRow[] => {
    const analysis = analyzeTranslationValidity(content);
    const { baseTranslatedById, model, translatedById, validation } = analysis;
    const visibleValidationErrors = getVisibleTranslationValidityErrors(analysis);

    if (visibleValidationErrors.length === 0) {
        return [];
    }
    const errorsById = new Map<
        string,
        {
            allCapsHints: string[];
            leakHints: string[];
            messages: string[];
            types: ValidationErrorType[];
            validationHighlightRanges: Range[];
        }
    >();
    const globalErrorBucket: { messages: string[]; types: ValidationErrorType[] } = { messages: [], types: [] };

    for (const error of visibleValidationErrors) {
        if (error.id) {
            const existing = errorsById.get(error.id) ?? {
                allCapsHints: [],
                leakHints: [],
                messages: [],
                types: [],
                validationHighlightRanges: [],
            };
            existing.messages.push(error.message);
            existing.types.push(error.type);
            if (error.type === 'arabic_leak' && error.matchText.trim().length > 0) {
                existing.leakHints.push(error.matchText.trim());
            }
            if (error.type === 'all_caps' && error.matchText.trim().length > 0) {
                existing.allCapsHints.push(error.matchText.trim());
            }
            if (error.segmentRange) {
                existing.validationHighlightRanges.push(error.segmentRange);
            }
            errorsById.set(error.id, existing);
        } else {
            globalErrorBucket.messages.push(error.message);
            globalErrorBucket.types.push(error.type);
        }
    }

    const excerptRows: InvalidExcerptRow[] = validation.arabicSegments.flatMap((segment) => {
        const errorBucket = errorsById.get(segment.id);
        if (!errorBucket || errorBucket.messages.length === 0) {
            return [];
        }

        return [
            {
                allCapsHints: [...new Set(errorBucket.allCapsHints)],
                arabic: segment.text,
                arabicLeakHints: [...new Set(errorBucket.leakHints)],
                baseTranslation: baseTranslatedById.get(segment.id) ?? null,
                errorTypes: [...new Set(errorBucket.types)],
                filePath,
                id: segment.id,
                messages: errorBucket.messages,
                model,
                patchHighlights: [],
                translation: translatedById.get(segment.id) ?? null,
                validationHighlightRanges: errorBucket.validationHighlightRanges,
            },
        ];
    });

    const matchedSegmentIds = new Set(validation.arabicSegments.map((segment) => segment.id));
    const unmatchedIdRows: InvalidExcerptRow[] = [...errorsById.entries()].flatMap(([id, errorBucket]) => {
        if (matchedSegmentIds.has(id) || errorBucket.messages.length === 0) {
            return [];
        }

        return [
            {
                allCapsHints: [...new Set(errorBucket.allCapsHints)],
                arabic: null,
                arabicLeakHints: [...new Set(errorBucket.leakHints)],
                baseTranslation: baseTranslatedById.get(id) ?? translatedById.get(id) ?? null,
                errorTypes: [...new Set(errorBucket.types)],
                filePath,
                id,
                messages: errorBucket.messages,
                model,
                patchHighlights: [],
                translation: translatedById.get(id) ?? null,
                validationHighlightRanges: errorBucket.validationHighlightRanges,
            },
        ];
    });

    if (globalErrorBucket.messages.length === 0) {
        return [...excerptRows, ...unmatchedIdRows];
    }

    return [
        ...excerptRows,
        ...unmatchedIdRows,
        {
            allCapsHints: [],
            arabic: null,
            arabicLeakHints: [],
            baseTranslation: null,
            errorTypes: [...new Set(globalErrorBucket.types)],
            filePath,
            id: null,
            messages: globalErrorBucket.messages,
            model,
            patchHighlights: [],
            translation: null,
            validationHighlightRanges: [],
        },
    ];
};

export const getInvalidExcerpts = async (): Promise<InvalidExcerptsResponse> => {
    const translationsDir = requireTranslationsDir();
    const filePaths = await collectTranslationFilePaths(translationsDir, '');
    const rows: InvalidExcerptRow[] = [];
    let invalidFileCount = 0;

    for (const filePath of filePaths) {
        try {
            const fullPath = path.join(translationsDir, filePath);
            const content = await readTextFile(fullPath);
            const fileRows = buildInvalidExcerptRowsForFile(filePath, content);

            if (fileRows.length > 0) {
                invalidFileCount += 1;
                rows.push(...fileRows);
            }
        } catch (error) {
            invalidFileCount += 1;
            rows.push({
                allCapsHints: [],
                arabic: null,
                arabicLeakHints: [],
                baseTranslation: null,
                errorTypes: ['file_error'],
                filePath,
                id: null,
                messages: [error instanceof Error ? error.message : 'Failed to validate translation file.'],
                patchHighlights: [],
                translation: null,
                validationHighlightRanges: [],
            });
        }
    }

    return { invalidFileCount, rowCount: rows.length, rows };
};

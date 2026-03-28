import '@tanstack/react-start/server-only';

import { randomUUID } from 'node:crypto';
import { mkdir, rename } from 'node:fs/promises';
import path from 'node:path';

import { requireCompilationFilePath, requireTranslationsDir } from '@/lib/data-paths';
import {
    applyExcerptsToCompilation,
    buildPlaybackTargetLocatorMap,
    getCompilationDuplicateTargetIds,
} from '@/lib/playback';
import { readJsonFile, readTextFile, writeTextFile } from '@/lib/runtime-files';
import type { CompilationPlaybackSimulationResponse, SaveCompilationPlaybackResponse } from '@/lib/shell-types';
import { analyzeTranslationValidity, isTranslationValidityAnalysisInvalid } from '@/lib/translation-validity';
import { collectTranslationFilePaths } from '@/lib/translations-browser';
import type { Compilation, Excerpt, Heading } from '@/types/compilation';
import { type CompilationStats, summarizeCompilationStats } from './compilation-stats';

type CountBucket = { total: number; translated: number; untranslated: number };
type CompilationPlaybackSimulationResult = {
    response: CompilationPlaybackSimulationResponse;
    updatedCompilation: Compilation;
};
type ExcerptIssueMap = Map<string, Set<string>>;

const summarizeCompilationCountBucket = <T extends { text?: string | null }>(items: T[]): CountBucket => {
    const translated = items.filter((item) => Boolean(item.text)).length;
    return { total: items.length, translated, untranslated: items.length - translated };
};

const summarizeCompilationSnapshot = (compilation: Compilation): CompilationStats => {
    const uniqueTranslators = new Set(
        compilation.excerpts.flatMap((excerpt) => (excerpt.translator ? [excerpt.translator] : [])),
    ).size;

    return summarizeCompilationStats({
        createdAt: compilation.createdAt ?? null,
        excerptStats: summarizeCompilationCountBucket<Excerpt>(compilation.excerpts),
        headingStats: summarizeCompilationCountBucket<Heading>(compilation.headings),
        lastUpdatedAt: compilation.lastUpdatedAt ?? null,
        uniqueTranslators,
    });
};

const addIssueSourceFile = (issueMap: ExcerptIssueMap, excerptId: string, filePath: string) => {
    const filePaths = issueMap.get(excerptId) ?? new Set<string>();
    filePaths.add(filePath);
    issueMap.set(excerptId, filePaths);
};

const serializeIssueMap = (issueMap: ExcerptIssueMap) =>
    [...issueMap.entries()]
        .map(([id, filePaths]) => ({ filePaths: [...filePaths].sort(), id }))
        .sort((left, right) => left.id.localeCompare(right.id));

const buildCompilationTargetIdSet = (compilation: Compilation) =>
    new Set(buildPlaybackTargetLocatorMap(compilation).keys());

const buildFullyTranslatedTargetIdSet = (compilation: Compilation) => {
    const locatorMap = buildPlaybackTargetLocatorMap(compilation);
    const translatedIds = new Set<string>();

    for (const [id, locators] of locatorMap.entries()) {
        if (locators.length > 1) {
            continue;
        }

        const isFullyTranslated = locators.every((locator) => {
            const target = compilation[locator.collection][locator.index];
            return Boolean(target.text);
        });

        if (isFullyTranslated) {
            translatedIds.add(id);
        }
    }

    return translatedIds;
};

const registerPlaybackExcerpt = ({
    fullyTranslatedExcerptIds,
    compilationExcerptIds,
    duplicateExcerptIds,
    excerpt,
    filePath,
    playableExcerpts,
    seenPlayableExcerptSourceFiles,
    unknownCompilationExcerptIds,
}: {
    fullyTranslatedExcerptIds: Set<string>;
    compilationExcerptIds: Set<string>;
    duplicateExcerptIds: ExcerptIssueMap;
    excerpt: Excerpt;
    filePath: string;
    playableExcerpts: Excerpt[];
    seenPlayableExcerptSourceFiles: Map<string, string>;
    unknownCompilationExcerptIds: ExcerptIssueMap;
}) => {
    if (!compilationExcerptIds.has(excerpt.id)) {
        addIssueSourceFile(unknownCompilationExcerptIds, excerpt.id, filePath);
        return 'unknown';
    }

    if (fullyTranslatedExcerptIds.has(excerpt.id)) {
        return 'already_translated';
    }

    const firstSeenFilePath = seenPlayableExcerptSourceFiles.get(excerpt.id);
    if (firstSeenFilePath) {
        addIssueSourceFile(duplicateExcerptIds, excerpt.id, firstSeenFilePath);
        addIssueSourceFile(duplicateExcerptIds, excerpt.id, filePath);
    } else {
        seenPlayableExcerptSourceFiles.set(excerpt.id, filePath);
    }

    playableExcerpts.push(excerpt);
    return 'playable';
};

const getPlaybackOutputPath = (compilationFilePath: string) => {
    const parsedPath = path.parse(compilationFilePath);
    const timestamp = new Date().toISOString().replaceAll(':', '-');
    return path.join(parsedPath.dir, `${parsedPath.name}_new_${timestamp}${parsedPath.ext || '.json'}`);
};

export const simulateCompilationPlayback = async (): Promise<CompilationPlaybackSimulationResult> => {
    const compilationFilePath = requireCompilationFilePath();
    const translationsDirectory = requireTranslationsDir();
    const filePaths = await collectTranslationFilePaths(translationsDirectory, '');
    const compilation = await readJsonFile<Compilation>(compilationFilePath);
    const compilationDuplicateTargetIds = getCompilationDuplicateTargetIds(compilation);
    const compilationExcerptIds = buildCompilationTargetIdSet(compilation);
    const fullyTranslatedExcerptIds = buildFullyTranslatedTargetIdSet(compilation);
    const seenPlayableExcerptSourceFiles = new Map<string, string>();

    const validFilePaths: string[] = [];
    const invalidFilePaths: string[] = [];
    const duplicateExcerptIds = new Map<string, Set<string>>();
    const skippedAlreadyTranslatedExcerptIds = new Map<string, Set<string>>();
    const unknownCompilationExcerptIds = new Map<string, Set<string>>();
    const playableExcerpts: Excerpt[] = [];
    let totalCandidateExcerptCount = 0;

    for (const filePath of filePaths) {
        const fullPath = path.join(translationsDirectory, filePath);
        const content = await readTextFile(fullPath);
        const analysis = analyzeTranslationValidity(content);

        if (isTranslationValidityAnalysisInvalid(analysis)) {
            invalidFilePaths.push(filePath);
            continue;
        }

        validFilePaths.push(filePath);
        const excerpts = analysis.validation.excerpts;
        totalCandidateExcerptCount += excerpts.length;

        for (const excerpt of excerpts) {
            const result = registerPlaybackExcerpt({
                compilationExcerptIds,
                duplicateExcerptIds,
                excerpt,
                filePath,
                fullyTranslatedExcerptIds,
                playableExcerpts,
                seenPlayableExcerptSourceFiles,
                unknownCompilationExcerptIds,
            });

            if (result === 'already_translated') {
                addIssueSourceFile(skippedAlreadyTranslatedExcerptIds, excerpt.id, filePath);
            }
        }
    }

    const updatedCompilation =
        compilationDuplicateTargetIds.length > 0
            ? compilation
            : applyExcerptsToCompilation(compilation, playableExcerpts);

    return {
        response: {
            appliedExcerptCount: compilationDuplicateTargetIds.length > 0 ? 0 : playableExcerpts.length,
            blockedByCompilationDuplicates: compilationDuplicateTargetIds.length > 0,
            compilationDuplicateTargetIds,
            compilationFilePath,
            compilationStatsAfter: summarizeCompilationSnapshot(updatedCompilation),
            compilationStatsBefore: summarizeCompilationSnapshot(compilation),
            duplicateExcerptIds: serializeIssueMap(duplicateExcerptIds),
            invalidFileCount: invalidFilePaths.length,
            invalidFilePaths,
            skippedAlreadyTranslatedExcerptIds: serializeIssueMap(skippedAlreadyTranslatedExcerptIds),
            totalCandidateExcerptCount,
            unknownCompilationExcerptIds: serializeIssueMap(unknownCompilationExcerptIds),
            validFileCount: validFilePaths.length,
            validFilePaths,
        },
        updatedCompilation,
    };
};

export const getCompilationPlaybackSimulation = async (): Promise<CompilationPlaybackSimulationResponse> =>
    (await simulateCompilationPlayback()).response;

export const saveCompilationPlayback = async (): Promise<SaveCompilationPlaybackResponse> => {
    const { response, updatedCompilation } = await simulateCompilationPlayback();

    if (response.blockedByCompilationDuplicates) {
        throw new Error('Playback is blocked because the compilation contains duplicate target IDs.');
    }

    const outputPath = getPlaybackOutputPath(response.compilationFilePath);
    const tempPath = `${outputPath}.${randomUUID()}.tmp`;
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeTextFile(tempPath, `${JSON.stringify(updatedCompilation, null, 2)}\n`);
    await rename(tempPath, outputPath);

    return { appliedExcerptCount: response.appliedExcerptCount, outputPath };
};

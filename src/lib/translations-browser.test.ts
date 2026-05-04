import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { getCompilationPlaybackSimulation } from './compilation-playback';
import { createRupturePatch, type RupturePatchMetadata } from './translation-patches';
import {
    collectTranslationFilePaths,
    deleteTranslationJsonFile,
    getInvalidExcerpts,
    getTranslationStats,
    getTranslationTree,
    invalidateTranslationTreeCache,
    summarizeTranslationStats,
    writeTranslationPatch,
    type TranslationTreeNode,
} from './translations-browser';

describe('summarizeTranslationStats', () => {
    it('should count translated and untranslated files and total applied patches', () => {
        expect(
            summarizeTranslationStats([
                { isValid: true, model: 'gpt-5-4-pro', patchesApplied: 2, path: 'a.json', reasoningDurationSec: 8 },
                { isValid: false, model: 'gpt-5-4-pro', patchesApplied: 1, path: 'b.json', reasoningDurationSec: 35 },
                {
                    isValid: false,
                    model: undefined,
                    patchesApplied: 0,
                    path: 'c.json',
                    reasoningDurationSec: undefined,
                },
            ]),
        ).toEqual({
            files: [
                { isValid: true, model: 'gpt-5-4-pro', patchesApplied: 2, path: 'a.json', reasoningDurationSec: 8 },
                { isValid: false, model: 'gpt-5-4-pro', patchesApplied: 1, path: 'b.json', reasoningDurationSec: 35 },
                {
                    isValid: false,
                    model: undefined,
                    patchesApplied: 0,
                    path: 'c.json',
                    reasoningDurationSec: undefined,
                },
            ],
            invalidByModel: { 'gpt-5-4-pro': 1, unknown: 1 },
            invalidFiles: 2,
            modelBreakdown: { 'gpt-5-4-pro': 2 },
            patchesApplied: 3,
            thinkingTimeBreakdown: { '1m_plus': 0, '10_to_30s': 0, '30_to_60s': 1, lt_10s: 1 },
            totalFiles: 3,
            validFiles: 1,
        });
    });
});

describe('invalid excerpts aggregation', () => {
    let tempDir = '';
    let compilationFilePath = '';
    let translationsDir = '';

    beforeEach(async () => {
        tempDir = await mkdtemp(path.join(os.tmpdir(), 'rupture-invalid-excerpts-'));
        translationsDir = path.join(tempDir, 'translations');
        compilationFilePath = path.join(tempDir, 'compilation.json');
        await writeFile(compilationFilePath, '{}');
        await mkdir(translationsDir, { recursive: true });
        process.env.TRANSLATIONS_DIR = translationsDir;
        process.env.COMPILATION_FILE_PATH = compilationFilePath;
    });

    afterEach(async () => {
        delete process.env.TRANSLATIONS_DIR;
        delete process.env.COMPILATION_FILE_PATH;
        if (tempDir) {
            await rm(tempDir, { force: true, recursive: true });
        }
    });

    it('should surface invalid rows for files whose translated output does not line up with the source markers', async () => {
        await writeFile(
            path.join(translationsDir, 'invented.json'),
            JSON.stringify({
                format: 'common',
                llm: 'ChatGPT',
                model: 'gpt-5-4-pro',
                prompt: 'Translate these excerpts carefully.\n\nP1 - نص عربي',
                reasoning: [],
                response: 'P100 - Hallucinated segment',
            }),
        );

        const [stats, invalid] = await Promise.all([getTranslationStats(), getInvalidExcerpts()]);

        expect(stats.invalidFiles).toBe(1);
        expect(invalid.invalidFileCount).toBe(1);
        expect(invalid.rowCount).toBeGreaterThanOrEqual(1);
        expect(invalid.rows).toContainEqual(
            expect.objectContaining({ filePath: 'invented.json', messages: expect.any(Array) }),
        );
    });

    it('should keep stats, invalid rows, and playback counts aligned after a file changes on disk', async () => {
        await writeFile(
            compilationFilePath,
            JSON.stringify({
                contractVersion: '1',
                createdAt: 1,
                excerpts: [
                    { id: 'P1', text: null, translator: null },
                    { id: 'P2', text: null, translator: null },
                ],
                footnotes: [],
                headings: [],
                lastUpdatedAt: 1,
                options: {},
                postProcessingApps: [],
            }),
        );

        await writeFile(
            path.join(translationsDir, 'valid.json'),
            JSON.stringify({
                format: 'common',
                llm: 'ChatGPT',
                model: 'gpt-5-4-pro',
                prompt: 'Translate carefully.\n\nP1 - نص عربي ١',
                reasoning: [],
                response: 'P1 - first translation',
            }),
        );

        await writeFile(
            path.join(translationsDir, 'invalid.json'),
            JSON.stringify({
                format: 'common',
                llm: 'ChatGPT',
                model: 'gpt-5-4-pro',
                prompt: 'Translate carefully.\n\nP2 - نص عربي ٢',
                reasoning: [],
                response: 'P2 - second translation مرحبا',
            }),
        );

        const firstStats = await getTranslationStats();
        const firstInvalid = await getInvalidExcerpts();
        const firstPlayback = await getCompilationPlaybackSimulation();

        expect(firstStats.validFiles).toBe(1);
        expect(firstStats.invalidFiles).toBe(1);
        expect(firstInvalid.invalidFileCount).toBe(1);
        expect(firstPlayback.validFileCount).toBe(1);
        expect(firstPlayback.invalidFileCount).toBe(1);

        await writeFile(
            path.join(translationsDir, 'invalid.json'),
            JSON.stringify({
                format: 'common',
                llm: 'ChatGPT',
                model: 'gpt-5-4-pro',
                prompt: 'Translate carefully.\n\nP2 - نص عربي ٢',
                reasoning: [],
                response: 'P2 - second translation fixed',
            }),
        );

        const nextStats = await getTranslationStats();
        const nextInvalid = await getInvalidExcerpts();
        const nextPlayback = await getCompilationPlaybackSimulation();

        expect(nextStats.validFiles).toBe(2);
        expect(nextStats.invalidFiles).toBe(0);
        expect(nextInvalid.invalidFileCount).toBe(0);
        expect(nextInvalid.rowCount).toBe(0);
        expect(nextPlayback.validFileCount).toBe(2);
        expect(nextPlayback.invalidFileCount).toBe(0);
    });
});

describe('translation tree caching', () => {
    let tempDir = '';
    let translationsDir = '';

    beforeEach(async () => {
        tempDir = await mkdtemp(path.join(os.tmpdir(), 'rupture-tree-cache-'));
        translationsDir = path.join(tempDir, 'translations');
        await mkdir(path.join(translationsDir, 'nested'), { recursive: true });
        process.env.TRANSLATIONS_DIR = translationsDir;
        invalidateTranslationTreeCache();
    });

    afterEach(async () => {
        delete process.env.TRANSLATIONS_DIR;
        invalidateTranslationTreeCache();
        if (tempDir) {
            await rm(tempDir, { force: true, recursive: true });
        }
    });

    it('should reuse the cached tree to collect file paths without a second directory walk', async () => {
        await writeFile(path.join(translationsDir, 'a.json'), '{}');
        await writeFile(path.join(translationsDir, 'nested', 'b.json'), '{}');

        const tree = await getTranslationTree();
        const filePaths = await collectTranslationFilePaths(translationsDir, '');

        expect(tree.entries).toHaveLength(2);
        expect([...filePaths].sort()).toEqual(['a.json', 'nested/b.json']);
    });

    it('should invalidate the cached tree after deleting a translation file', async () => {
        await writeFile(path.join(translationsDir, 'a.json'), '{}');
        await writeFile(path.join(translationsDir, 'nested', 'b.json'), '{}');

        const firstTree = await getTranslationTree();
        expect(collectFilePathsFromTree(firstTree.entries).sort()).toEqual(['a.json', 'nested/b.json']);

        await deleteTranslationJsonFile('nested/b.json');

        const nextTree = await getTranslationTree();
        expect(collectFilePathsFromTree(nextTree.entries).sort()).toEqual(['a.json']);
    });
});

describe('writeTranslationPatch', () => {
    let tempDir = '';
    let translationsDir = '';
    let relativePath = '';

    const createPatchMetadata = (start: number, end: number): RupturePatchMetadata => ({
        appliedAt: '2026-05-02T00:00:00.000Z',
        highlightRanges: [{ end, start }],
        source: {
            kind: 'llm',
            model: 'z-ai/glm4.7',
            provider: 'nvidia',
            task: 'arabic_leak_correction',
        },
    });

    const createBaseTranslationFile = async (
        overrides: Record<string, unknown> = {},
        ruptureOverrides?: Record<string, unknown>,
    ) => {
        const baseFile = {
            format: 'common',
            llm: 'ChatGPT',
            model: 'gpt-5-4-pro',
            prompt: 'Translate carefully.\n\nP1 - نص عربي ١\n\nP2 - نص عربي ٢',
            reasoning: [],
            response: 'P1 - first translation\n\nP2 - second translation',
            ...(ruptureOverrides ? { __rupture: ruptureOverrides } : {}),
            ...overrides,
        };

        await writeFile(path.join(translationsDir, relativePath), JSON.stringify(baseFile, null, 2));
    };

    beforeEach(async () => {
        tempDir = await mkdtemp(path.join(os.tmpdir(), 'rupture-write-patch-'));
        translationsDir = path.join(tempDir, 'translations');
        relativePath = 'sample.json';
        await mkdir(translationsDir, { recursive: true });
        process.env.TRANSLATIONS_DIR = translationsDir;
    });

    afterEach(async () => {
        delete process.env.TRANSLATIONS_DIR;
        if (tempDir) {
            await rm(tempDir, { force: true, recursive: true });
        }
    });

    it('should persist patch metadata alongside saved patches without disturbing other rupture fields', async () => {
        const patch = createRupturePatch('first translation', 'first translation fixed');
        if (!patch) {
            throw new Error('Expected patch to be created');
        }

        const patchMetadata = createPatchMetadata(0, 5);
        await createBaseTranslationFile({}, { skip: ['P2'] });

        const result = await writeTranslationPatch(relativePath, 'P1', patch, patchMetadata);
        const saved = JSON.parse(await readFile(path.join(translationsDir, relativePath), 'utf8')) as {
            __rupture?: {
                patchMetadata?: Record<string, RupturePatchMetadata>;
                patches?: Record<string, typeof patch>;
                skip?: string[];
            };
        };

        expect(result.relativePath).toBe(relativePath);
        expect(saved.__rupture?.patches).toEqual({ P1: patch });
        expect(saved.__rupture?.patchMetadata).toEqual({ P1: patchMetadata });
        expect(saved.__rupture?.skip).toEqual(['P2']);
    });

    it('should delete patch metadata when removing a saved patch while preserving other entries', async () => {
        const patch1 = createRupturePatch('first translation', 'first translation fixed');
        const patch2 = createRupturePatch('second translation', 'second translation fixed');
        if (!patch1 || !patch2) {
            throw new Error('Expected patches to be created');
        }

        const patchMetadata1 = createPatchMetadata(0, 5);
        const patchMetadata2 = createPatchMetadata(7, 13);
        await createBaseTranslationFile({}, {
            patchMetadata: { P1: patchMetadata1, P2: patchMetadata2 },
            patches: { P1: patch1, P2: patch2 },
            skip: ['P2'],
        });

        await writeTranslationPatch(relativePath, 'P1', null);

        const saved = JSON.parse(await readFile(path.join(translationsDir, relativePath), 'utf8')) as {
            __rupture?: {
                patchMetadata?: Record<string, RupturePatchMetadata>;
                patches?: Record<string, typeof patch2>;
                skip?: string[];
            };
        };

        expect(saved.__rupture?.patches).toEqual({ P2: patch2 });
        expect(saved.__rupture?.patchMetadata).toEqual({ P2: patchMetadata2 });
        expect(saved.__rupture?.skip).toEqual(['P2']);
    });

    it('should remove the rupture metadata block when the last saved patch is deleted', async () => {
        const patch = createRupturePatch('first translation', 'first translation fixed');
        if (!patch) {
            throw new Error('Expected patch to be created');
        }

        const patchMetadata = createPatchMetadata(0, 5);
        await createBaseTranslationFile({}, { patchMetadata: { P1: patchMetadata }, patches: { P1: patch } });

        await writeTranslationPatch(relativePath, 'P1', null);

        const saved = JSON.parse(await readFile(path.join(translationsDir, relativePath), 'utf8')) as {
            __rupture?: unknown;
        };

        expect(saved.__rupture).toBeUndefined();
    });

    it('should reject excerpt ids that are not present in the source prompt', async () => {
        const patch = createRupturePatch('first translation', 'first translation fixed');
        if (!patch) {
            throw new Error('Expected patch to be created');
        }

        await createBaseTranslationFile();

        try {
            await writeTranslationPatch(relativePath, 'P99', patch);
            throw new Error('Expected writeTranslationPatch to throw');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toBe('Excerpt not found.');
        }
    });
});

const collectFilePathsFromTree = (nodes: TranslationTreeNode[]): string[] =>
    nodes.flatMap((node) =>
        node.kind === 'file' ? [node.relativePath] : collectFilePathsFromTree(node.children ?? []),
    );

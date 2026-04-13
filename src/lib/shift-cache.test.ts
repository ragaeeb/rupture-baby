import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { __resetShiftCacheForTests, getShiftCache, getShiftSettingsInfo } from './shift-cache';

describe('getShiftCache', () => {
    let tempDir = '';
    let compilationFilePath = '';

    beforeEach(async () => {
        tempDir = await mkdtemp(path.join(os.tmpdir(), 'rupture-shift-cache-'));
        compilationFilePath = path.join(tempDir, 'compilation.json');
        process.env.COMPILATION_FILE_PATH = compilationFilePath;
        __resetShiftCacheForTests();
    });

    afterEach(async () => {
        delete process.env.COMPILATION_FILE_PATH;
        __resetShiftCacheForTests();
        if (tempDir) {
            await rm(tempDir, { force: true, recursive: true });
        }
    });

    it('should include untranslated headings and footnotes after untranslated excerpts', async () => {
        await writeFile(
            compilationFilePath,
            JSON.stringify({
                contractVersion: '1',
                createdAt: 1,
                excerpts: [
                    { from: 0, id: 'P1', nass: 'excerpt translated', text: 'done' },
                    { from: 1, id: 'P2', nass: 'excerpt untranslated', text: null },
                ],
                footnotes: [
                    { from: 3, id: 'F1', nass: 'footnote untranslated', text: null },
                    { from: 4, id: 'F2', nass: 'footnote translated', text: 'done' },
                ],
                headings: [
                    { from: 2, id: 'H1', nass: 'heading untranslated', text: null },
                    { from: 5, id: 'H2', nass: 'heading translated', text: 'done' },
                ],
                lastUpdatedAt: 1,
                options: {},
                postProcessingApps: [],
                promptForTranslation: 'prompt',
            }),
        );

        const shiftCache = await getShiftCache();

        expect(shiftCache.prompt).toBe('prompt');
        expect(shiftCache.queue).toEqual([
            { id: 'P2', nass: 'excerpt untranslated' },
            { id: 'H1', nass: 'heading untranslated' },
            { id: 'F1', nass: 'footnote untranslated' },
        ]);
    });

    it('should resume from a persisted shift checkpoint', async () => {
        await writeFile(
            compilationFilePath,
            JSON.stringify({
                contractVersion: '1',
                createdAt: 1,
                excerpts: [
                    { from: 0, id: 'P1', nass: 'excerpt one', text: null },
                    { from: 1, id: 'P2', nass: 'excerpt two', text: null },
                ],
                footnotes: [],
                headings: [],
                lastUpdatedAt: 1,
                options: {},
                postProcessingApps: [],
                promptForTranslation: 'prompt',
            }),
        );
        const compilationStats = await stat(compilationFilePath);

        await writeFile(
            path.join(tempDir, '.compilation.settings.json'),
            JSON.stringify({
                shiftedCount: 1,
                sourceMtimeMs: compilationStats.mtimeMs,
                version: 1,
            }),
        );

        const shiftCache = await getShiftCache();

        expect(shiftCache.queue).toEqual([{ id: 'P2', nass: 'excerpt two' }]);
        expect(shiftCache.shiftedCount).toBe(1);
        expect(shiftCache.shiftedIds).toEqual(['P1']);
    });

    it('should resume by shifted IDs when the rebuilt queue changes shape', async () => {
        await writeFile(
            compilationFilePath,
            JSON.stringify({
                contractVersion: '1',
                createdAt: 1,
                excerpts: [
                    { from: 0, id: 'P0', nass: 'new excerpt before checkpoint', text: null },
                    { from: 1, id: 'P1', nass: 'already shifted excerpt', text: null },
                    { from: 2, id: 'P2', nass: 'excerpt two', text: null },
                ],
                footnotes: [],
                headings: [],
                lastUpdatedAt: 1,
                options: {},
                postProcessingApps: [],
                promptForTranslation: 'prompt',
            }),
        );
        const compilationStats = await stat(compilationFilePath);

        await writeFile(
            path.join(tempDir, '.compilation.settings.json'),
            JSON.stringify({
                shiftedCount: 1,
                shiftedIds: ['P1'],
                sourceMtimeMs: compilationStats.mtimeMs,
                version: 1,
            }),
        );

        const shiftCache = await getShiftCache();

        expect(shiftCache.queue).toEqual([
            { id: 'P0', nass: 'new excerpt before checkpoint' },
            { id: 'P2', nass: 'excerpt two' },
        ]);
        expect(shiftCache.shiftedCount).toBe(1);
        expect(shiftCache.shiftedIds).toEqual(['P1']);
    });

    it('should report shift settings info', async () => {
        await writeFile(
            compilationFilePath,
            JSON.stringify({
                contractVersion: '1',
                createdAt: 1,
                excerpts: [{ from: 0, id: 'P1', nass: 'excerpt one', text: null }],
                footnotes: [],
                headings: [],
                lastUpdatedAt: 1,
                options: {},
                postProcessingApps: [],
                promptForTranslation: 'prompt',
            }),
        );

        const compilationStats = await stat(compilationFilePath);

        await writeFile(
            path.join(tempDir, '.compilation.settings.json'),
            JSON.stringify({
                shiftedCount: 1,
                shiftedIds: ['P1'],
                sourceMtimeMs: compilationStats.mtimeMs,
                version: 1,
            }),
        );

        const info = await getShiftSettingsInfo();
        expect(info.hasCheckpoint).toBe(true);
        expect(info.shiftedCount).toBe(1);
        expect(info.shiftedIdCount).toBe(1);
        expect(info.lastShiftedId).toBe('P1');
        expect(info.checkpointValid).toBe(true);
    });

    it('should accept checkpoint mtimes with fractional precision', async () => {
        await writeFile(
            compilationFilePath,
            JSON.stringify({
                contractVersion: '1',
                createdAt: 1,
                excerpts: [
                    { from: 0, id: 'P1', nass: 'excerpt one', text: null },
                    { from: 1, id: 'P2', nass: 'excerpt two', text: null },
                ],
                footnotes: [],
                headings: [],
                lastUpdatedAt: 1,
                options: {},
                postProcessingApps: [],
                promptForTranslation: 'prompt',
            }),
        );

        const compilationStats = await stat(compilationFilePath);

        await writeFile(
            path.join(tempDir, '.compilation.settings.json'),
            JSON.stringify({
                shiftedCount: 1,
                sourceMtimeMs: compilationStats.mtimeMs + 0.468,
                version: 1,
            }),
        );

        const [shiftCache, info] = await Promise.all([getShiftCache(), getShiftSettingsInfo()]);

        expect(shiftCache.queue).toEqual([{ id: 'P2', nass: 'excerpt two' }]);
        expect(shiftCache.shiftedCount).toBe(1);
        expect(info.checkpointValid).toBe(true);
    });
});

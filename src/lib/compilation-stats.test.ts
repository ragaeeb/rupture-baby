import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
    getCompilationStats,
    getCompilationStatsSnapshotPath,
    invalidateCompilationStatsCache,
    summarizeCompilationStats,
} from './compilation-stats';

describe('summarizeCompilationStats', () => {
    it('should combine excerpt and heading counts into dashboard-ready compilation stats', () => {
        expect(
            summarizeCompilationStats({
                createdAt: 1_000,
                excerptStats: { total: 3, translated: 2, untranslated: 1 },
                headingStats: { total: 2, translated: 1, untranslated: 1 },
                lastUpdatedAt: 7_000,
                uniqueTranslators: 2,
            }),
        ).toEqual({
            createdAt: 1_000,
            excerpts: { total: 3, translated: 2, untranslated: 1 },
            headings: { total: 2, translated: 1, untranslated: 1 },
            lastUpdatedAt: 7_000,
            totalSegments: 5,
            translatedSegments: 3,
            uniqueTranslators: 2,
            untranslatedSegments: 2,
            workDurationMs: 6_000,
        });
    });
});

describe('getCompilationStats', () => {
    let tempDir = '';
    let compilationFilePath = '';

    beforeEach(async () => {
        tempDir = await mkdtemp(path.join(os.tmpdir(), 'rupture-compilation-stats-'));
        compilationFilePath = path.join(tempDir, 'compilation.json');
        process.env.COMPILATION_FILE_PATH = compilationFilePath;
        invalidateCompilationStatsCache();
    });

    afterEach(async () => {
        delete process.env.COMPILATION_FILE_PATH;
        invalidateCompilationStatsCache();
        if (tempDir) {
            await rm(tempDir, { force: true, recursive: true });
        }
    });

    it('should write and reuse a disk snapshot when the compilation mtime is unchanged', async () => {
        await writeFile(
            compilationFilePath,
            JSON.stringify({
                contractVersion: '1',
                createdAt: 1000,
                excerpts: [{ id: 'P1', lastUpdatedAt: 1001, meta: {}, text: 'first', translator: 879 }],
                footnotes: [],
                headings: [{ id: 'T1', lastUpdatedAt: 1001, text: null }],
                lastUpdatedAt: 1001,
                options: {},
                postProcessingApps: [],
            }),
        );

        await getCompilationStats();

        const snapshotPath = getCompilationStatsSnapshotPath(compilationFilePath);
        await access(snapshotPath);

        const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as {
            sourceMtimeMs: number;
            stats: { totalSegments: number; uniqueTranslators: number };
        };
        snapshot.stats.totalSegments = 999;
        snapshot.stats.uniqueTranslators = 888;
        await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);

        invalidateCompilationStatsCache();
        const reused = await getCompilationStats();

        expect(reused.totalSegments).toBe(999);
        expect(reused.uniqueTranslators).toBe(888);
    });

    it('should discard a stale disk snapshot when the compilation file changes', async () => {
        await writeFile(
            compilationFilePath,
            JSON.stringify({
                contractVersion: '1',
                createdAt: 1000,
                excerpts: [{ id: 'P1', lastUpdatedAt: 1001, meta: {}, text: 'first', translator: 879 }],
                footnotes: [],
                headings: [],
                lastUpdatedAt: 1001,
                options: {},
                postProcessingApps: [],
            }),
        );

        await getCompilationStats();

        const snapshotPath = getCompilationStatsSnapshotPath(compilationFilePath);
        const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as {
            sourceMtimeMs: number;
            stats: { totalSegments: number };
        };
        snapshot.stats.totalSegments = 999;
        await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);

        await new Promise((resolve) => setTimeout(resolve, 20));
        await writeFile(
            compilationFilePath,
            JSON.stringify({
                contractVersion: '1',
                createdAt: 1000,
                excerpts: [
                    { id: 'P1', lastUpdatedAt: 1001, meta: {}, text: 'first', translator: 879 },
                    { id: 'P2', lastUpdatedAt: 1002, meta: {}, text: null, translator: 890 },
                ],
                footnotes: [],
                headings: [{ id: 'T1', lastUpdatedAt: 1002, text: 'heading' }],
                lastUpdatedAt: 1002,
                options: {},
                postProcessingApps: [],
            }),
        );

        invalidateCompilationStatsCache();
        const refreshed = await getCompilationStats();

        expect(refreshed.totalSegments).toBe(3);
        expect(refreshed.translatedSegments).toBe(2);
        expect(refreshed.untranslatedSegments).toBe(1);
        expect(refreshed.uniqueTranslators).toBe(2);
    });
});

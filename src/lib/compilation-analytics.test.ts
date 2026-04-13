import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
    getCompilationAnalytics,
    getCompilationAnalyticsSnapshotPath,
    invalidateCompilationAnalyticsCache,
    summarizeCompilationAnalytics,
} from './compilation-analytics';

describe('summarizeCompilationAnalytics', () => {
    it('should build cumulative timeline data and translator shares', () => {
        const analytics = summarizeCompilationAnalytics({
            createdAt: 1_000,
            dailyBuckets: new Map([
                ['2026-03-18', { excerpts: 2, headings: 1 }],
                ['2026-03-19', { excerpts: 1, headings: 0 }],
            ]),
            duplicateAltCountDistribution: new Map([
                [1, 2],
                [3, 1],
            ]),
            duplicateTranslationSegmentCount: 3,
            duplicateTranslationsTotal: 5,
            excerptsSummary: { total: 4, translated: 3, untranslated: 1 },
            headingsSummary: { total: 2, translated: 1, untranslated: 1 },
            lastUpdatedAt: 5_000,
            patchCount: 4,
            patchTypeCounts: new Map([
                ['arabic_leak_correction', 3],
                ['all_caps_correction', 1],
            ]),
            translatorCounts: new Map([
                ['879', 3],
                ['890', 1],
            ]),
        });

        expect(analytics.createdAt).toBe(1_000);
        expect(analytics.duplicateTranslationAltCountDistribution).toEqual([
            { altCount: 1, label: '1 alt', segments: 2 },
            { altCount: 3, label: '3 alts', segments: 1 },
        ]);
        expect(analytics.duplicateTranslationSegmentCount).toBe(3);
        expect(analytics.duplicateTranslationsTotal).toBe(5);
        expect(analytics.lastUpdatedAt).toBe(5_000);
        expect(analytics.patchCount).toBe(4);
        expect(analytics.patchTypeDistribution).toEqual([
            { count: 3, label: 'Arabic Leak', type: 'arabic_leak_correction' },
            { count: 1, label: 'All Caps', type: 'all_caps_correction' },
        ]);
        expect(analytics.totalSegments).toBe(6);
        expect(analytics.translatedSegments).toBe(4);
        expect(analytics.untranslatedSegments).toBe(2);
        expect(analytics.uniqueTranslators).toBe(2);
        expect(analytics.workDurationSeconds).toBe(4_000);
        expect(analytics.timeline).toEqual([
            {
                completionPercent: 50,
                cumulativeTranslated: 3,
                date: '2026-03-18',
                excerpts: 2,
                headings: 1,
                label: 'Mar 18',
                translated: 3,
            },
            {
                completionPercent: 66.7,
                cumulativeTranslated: 4,
                date: '2026-03-19',
                excerpts: 1,
                headings: 0,
                label: 'Mar 19',
                translated: 1,
            },
        ]);
        expect(analytics.timelineGranularity).toBe('day');
        expect(analytics.translators).toEqual([
            { count: 3, id: '879', label: 'GPT 5o', percent: 75 },
            { count: 1, id: '890', label: 'Gemini 3.0 Pro', percent: 25 },
        ]);
    });

    it('should downsample long timelines to weeks', () => {
        const dailyBuckets = new Map<string, { excerpts: number; headings: number }>();

        for (let day = 0; day < 120; day += 1) {
            const date = new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
            dailyBuckets.set(date, { excerpts: 1, headings: 0 });
        }

        const analytics = summarizeCompilationAnalytics({
            createdAt: 1_000,
            dailyBuckets,
            duplicateAltCountDistribution: new Map(),
            duplicateTranslationSegmentCount: 0,
            duplicateTranslationsTotal: 0,
            excerptsSummary: { total: 120, translated: 120, untranslated: 0 },
            headingsSummary: { total: 0, translated: 0, untranslated: 0 },
            lastUpdatedAt: 5_000,
            patchCount: 0,
            patchTypeCounts: new Map(),
            translatorCounts: new Map([['879', 120]]),
        });

        expect(analytics.timelineGranularity).toBe('week');
        expect(analytics.timeline.length).toBeLessThan(120);
        expect(analytics.timeline.at(-1)?.cumulativeTranslated).toBe(120);
        expect(analytics.timeline[0]?.label.startsWith('Week of ')).toBe(true);
    });

    it('should downsample year-scale timelines to months and group long-tail translators', () => {
        const dailyBuckets = new Map<string, { excerpts: number; headings: number }>();

        for (let day = 0; day < 420; day += 1) {
            const date = new Date(Date.UTC(2025, 0, 1 + day)).toISOString().slice(0, 10);
            dailyBuckets.set(date, { excerpts: 1, headings: 0 });
        }

        const translatorCounts = new Map<string, number>([
            ['879', 40],
            ['890', 30],
            ['893', 20],
            ['895', 10],
            ['900', 9],
            ['901', 8],
            ['903', 7],
            ['904', 6],
            ['905', 5],
            ['906', 4],
        ]);

        const analytics = summarizeCompilationAnalytics({
            createdAt: 1_000,
            dailyBuckets,
            duplicateAltCountDistribution: new Map(),
            duplicateTranslationSegmentCount: 0,
            duplicateTranslationsTotal: 0,
            excerptsSummary: { total: 420, translated: 420, untranslated: 0 },
            headingsSummary: { total: 0, translated: 0, untranslated: 0 },
            lastUpdatedAt: 5_000,
            patchCount: 0,
            patchTypeCounts: new Map(),
            translatorCounts,
        });

        expect(analytics.timelineGranularity).toBe('month');
        expect(analytics.timeline.length).toBeLessThan(420);
        expect(analytics.translators).toHaveLength(8);
        expect(analytics.translators.at(-1)).toEqual({
            count: 15,
            id: 'other',
            label: 'Other (3)',
            percent: expect.any(Number),
        });
    });
});

describe('getCompilationAnalytics', () => {
    let tempDir = '';
    let compilationFilePath = '';

    beforeEach(async () => {
        tempDir = await mkdtemp(path.join(os.tmpdir(), 'rupture-compilation-analytics-'));
        compilationFilePath = path.join(tempDir, 'compilation.json');
        process.env.COMPILATION_FILE_PATH = compilationFilePath;
        invalidateCompilationAnalyticsCache();
    });

    afterEach(async () => {
        delete process.env.COMPILATION_FILE_PATH;
        invalidateCompilationAnalyticsCache();
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
                headings: [],
                lastUpdatedAt: 1001,
                options: {},
                postProcessingApps: [],
            }),
        );

        await getCompilationAnalytics();

        const snapshotPath = getCompilationAnalyticsSnapshotPath(compilationFilePath);
        await access(snapshotPath);

        const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as {
            analytics: { timelineGranularity: string; totalSegments: number };
            sourceMtimeMs: number;
        };
        snapshot.analytics.timelineGranularity = 'month';
        snapshot.analytics.totalSegments = 999;
        await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);

        invalidateCompilationAnalyticsCache();
        const reused = await getCompilationAnalytics();

        expect(reused.timelineGranularity).toBe('month');
        expect(reused.totalSegments).toBe(999);
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

        await getCompilationAnalytics();

        const snapshotPath = getCompilationAnalyticsSnapshotPath(compilationFilePath);
        const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as {
            analytics: { totalSegments: number };
            sourceMtimeMs: number;
        };
        snapshot.analytics.totalSegments = 999;
        await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);

        await new Promise((resolve) => setTimeout(resolve, 20));
        await writeFile(
            compilationFilePath,
            JSON.stringify({
                contractVersion: '1',
                createdAt: 1000,
                excerpts: [
                    { id: 'P1', lastUpdatedAt: 1001, meta: {}, text: 'first', translator: 879 },
                    { id: 'P2', lastUpdatedAt: 1002, meta: {}, text: 'second', translator: 890 },
                ],
                footnotes: [],
                headings: [],
                lastUpdatedAt: 1002,
                options: {},
                postProcessingApps: [],
            }),
        );

        invalidateCompilationAnalyticsCache();
        const refreshed = await getCompilationAnalytics();

        expect(refreshed.totalSegments).toBe(2);
        expect(refreshed.totalSegments).not.toBe(999);
    });
});

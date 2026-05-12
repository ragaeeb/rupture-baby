import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
    __resetCompilationSnapshotForTests,
    getCompilationSnapshot,
    getCompilationSnapshotPath,
    getCompilationSnapshotShiftQueue,
    invalidateCompilationSnapshot,
} from './compilation-cache';

describe('getCompilationSnapshot', () => {
    let compilationFilePath = '';
    let tempDir = '';

    beforeEach(async () => {
        tempDir = await mkdtemp(path.join(os.tmpdir(), 'rupture-compilation-cache-'));
        compilationFilePath = path.join(tempDir, 'compilation.json');
        process.env.COMPILATION_FOLDER = tempDir;
        invalidateCompilationSnapshot();
        __resetCompilationSnapshotForTests();
    });

    afterEach(async () => {
        delete process.env.COMPILATION_FOLDER;
        invalidateCompilationSnapshot();
        __resetCompilationSnapshotForTests();
        if (tempDir) {
            await rm(tempDir, { force: true, recursive: true });
        }
    });

    it('should build prompt, summary, analytics, and untranslated caches in one snapshot', async () => {
        await writeFile(
            compilationFilePath,
            JSON.stringify({
                contractVersion: '1',
                createdAt: 1000,
                excerpts: [
                    { from: 0, id: 'P1', lastUpdatedAt: 1001, meta: {}, nass: 'done', text: 'done', translator: 879 },
                    { from: 1, id: 'P2', lastUpdatedAt: 1002, meta: {}, nass: 'todo', text: null },
                ],
                footnotes: [{ from: 4, id: 'F1', lastUpdatedAt: 1004, meta: {}, nass: 'footnote', text: null }],
                headings: [{ from: 3, id: 'H1', lastUpdatedAt: 1003, meta: {}, nass: 'heading', text: null }],
                lastUpdatedAt: 1005,
                options: {},
                postProcessingApps: [],
                promptForTranslation: 'translate these',
                promptId: 'PROMPT_A',
            }),
        );

        const snapshot = await getCompilationSnapshot();
        const shiftQueue = await getCompilationSnapshotShiftQueue();

        expect(snapshot.promptForTranslation).toBe('translate these');
        expect(snapshot.promptId).toBe('PROMPT_A');
        expect(snapshot.browseSummary.excerpts).toEqual({ total: 2, translated: 1, untranslated: 1 });
        expect(snapshot.browseSummary.headings).toEqual({ total: 1, translated: 0, untranslated: 1 });
        expect(snapshot.browseSummary.footnotes).toEqual({ total: 1, translated: 0, untranslated: 1 });
        expect(snapshot.untranslatedExcerpts.map((excerpt) => excerpt.id)).toEqual(['P2']);
        expect(snapshot.untranslatedHeadings.map((excerpt) => excerpt.id)).toEqual(['H1']);
        expect(snapshot.untranslatedFootnotes.map((excerpt) => excerpt.id)).toEqual(['F1']);
        expect(shiftQueue).toEqual([
            { id: 'P2', nass: 'todo' },
            { id: 'H1', nass: 'heading' },
            { id: 'F1', nass: 'footnote' },
        ]);
        expect(snapshot.stats.totalSegments).toBe(3);
        expect(snapshot.analytics.totalSegments).toBe(3);
    });

    it('should write and reuse a disk snapshot while the source mtime is unchanged', async () => {
        await writeFile(
            compilationFilePath,
            JSON.stringify({
                contractVersion: '1',
                createdAt: 1000,
                excerpts: [
                    { from: 0, id: 'P1', lastUpdatedAt: 1001, meta: {}, nass: 'done', text: 'done', translator: 879 },
                ],
                footnotes: [],
                headings: [],
                lastUpdatedAt: 1001,
                options: {},
                postProcessingApps: [],
                promptForTranslation: 'translate these',
            }),
        );

        await getCompilationSnapshot();

        const snapshotPath = getCompilationSnapshotPath(compilationFilePath);
        await access(snapshotPath);

        const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as {
            analytics: { totalSegments: number };
            promptForTranslation: string;
            sourceMtimeMs: number;
        };
        snapshot.analytics.totalSegments = 999;
        snapshot.promptForTranslation = 'cached prompt';
        await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);

        invalidateCompilationSnapshot();
        __resetCompilationSnapshotForTests();
        const reused = await getCompilationSnapshot();

        expect(reused.analytics.totalSegments).toBe(999);
        expect(reused.promptForTranslation).toBe('cached prompt');
    });
});

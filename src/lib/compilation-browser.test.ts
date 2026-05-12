import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { getCompilationBrowsePage } from './compilation-browser';

describe('getCompilationBrowsePage', () => {
    let compilationFilePath = '';
    let tempDir = '';

    beforeEach(async () => {
        tempDir = await mkdtemp(path.join(os.tmpdir(), 'rupture-compilation-browser-'));
        compilationFilePath = path.join(tempDir, 'compilation.json');
        process.env.COMPILATION_FOLDER = tempDir;
    });

    afterEach(async () => {
        delete process.env.COMPILATION_FOLDER;
        if (tempDir) {
            await rm(tempDir, { force: true, recursive: true });
        }
    });

    it('should stream a single collection page with translated and untranslated counts', async () => {
        await writeFile(
            compilationFilePath,
            JSON.stringify({
                contractVersion: '1',
                createdAt: 1,
                excerpts: [
                    {
                        from: 10,
                        id: 'P1',
                        lastUpdatedAt: 100,
                        meta: { num: '1' },
                        nass: 'أول',
                        text: 'First',
                        to: 12,
                        translator: 879,
                    },
                    { from: 13, id: 'P2', lastUpdatedAt: 101, nass: 'ثان', text: null },
                ],
                footnotes: [{ from: 20, id: 'F1', lastUpdatedAt: 102, nass: 'حاشية', text: 'Footnote' }],
                headings: [{ from: 5, id: 'H1', lastUpdatedAt: 99, nass: 'عنوان', parent: 'P1', text: null }],
                lastUpdatedAt: 1,
                options: {},
                postProcessingApps: [],
            }),
        );

        const page = await getCompilationBrowsePage({ collection: 'excerpts', page: 2, pageSize: 1 });

        expect(page.collection).toBe('excerpts');
        expect(page.pagination.page).toBe(2);
        expect(page.pagination.totalItems).toBe(2);
        expect(page.pagination.totalPages).toBe(2);
        expect(page.summary).toEqual({ total: 2, translated: 1, untranslated: 1 });
        expect(page.rows).toEqual([
            {
                collection: 'excerpts',
                from: 13,
                id: 'P2',
                index: 1,
                isTranslated: false,
                lastUpdatedAt: 101,
                nass: 'ثان',
                num: null,
                parent: null,
                text: null,
                to: null,
                translator: null,
            },
        ]);
    });

    it('should keep heading-specific metadata and clamp pages past the end', async () => {
        await writeFile(
            compilationFilePath,
            JSON.stringify({
                contractVersion: '1',
                createdAt: 1,
                excerpts: [],
                footnotes: [],
                headings: [{ from: 5, id: 'H1', lastUpdatedAt: 99, nass: 'عنوان', parent: 'P1', text: null }],
                lastUpdatedAt: 1,
                options: {},
                postProcessingApps: [],
            }),
        );

        const page = await getCompilationBrowsePage({ collection: 'headings', page: 9, pageSize: 1 });

        expect(page.pagination.page).toBe(1);
        expect(page.pagination.totalPages).toBe(1);
        expect(page.rows[0]).toMatchObject({ collection: 'headings', id: 'H1', index: 0, parent: 'P1' });
    });
});

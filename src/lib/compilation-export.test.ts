import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { __resetCompilationSnapshotForTests, invalidateCompilationSnapshot } from './compilation-cache';
import { DEFAULT_COMPILATION_EXPORT_PROVIDER } from './compilation-export-shared';

mock.module('bitaboom', () => ({
    estimateTokenCount: (text: string) => text.length,
    LLMProvider: { Gemini: 'gemini', Grok: 'grok', OpenAI: 'openai' },
}));

const { getCompilationExportPageData } = await import('./compilation-export');

describe('getCompilationExportPageData', () => {
    let compilationFilePath = '';
    let tempDir = '';

    beforeEach(async () => {
        tempDir = await mkdtemp(path.join(os.tmpdir(), 'rupture-compilation-export-'));
        compilationFilePath = path.join(tempDir, 'compilation.json');
        process.env.COMPILATION_FOLDER = tempDir;
        invalidateCompilationSnapshot();
        __resetCompilationSnapshotForTests();

        await writeFile(
            compilationFilePath,
            JSON.stringify({
                contractVersion: '1',
                createdAt: 1_770_000_000,
                excerpts: [
                    { from: 0, id: 'P1', nass: 'alpha alpha alpha', text: null },
                    { from: 1, id: 'P2', nass: 'beta beta beta beta beta', text: null },
                ],
                footnotes: [],
                headings: [{ from: 2, id: 'H1', nass: 'heading heading heading', text: null }],
                lastUpdatedAt: 1_770_000_001,
                options: {},
                postProcessingApps: [],
                promptForTranslation: 'Translate every item into English and preserve the IDs exactly.',
                promptId: 'FATAWA',
            }),
        );
    });

    afterEach(async () => {
        delete process.env.COMPILATION_FOLDER;
        invalidateCompilationSnapshot();
        __resetCompilationSnapshotForTests();
        if (tempDir) {
            await rm(tempDir, { force: true, recursive: true });
        }
    });

    it('should split the stripped compilation into multiple chunks when the token budget is small', async () => {
        const data = await getCompilationExportPageData({
            contextWindowTokens: 300,
            provider: DEFAULT_COMPILATION_EXPORT_PROVIDER,
            reservedTokens: 80,
        });

        expect(data.error).toBeNull();
        expect(data.plan).not.toBeNull();
        expect(data.plan?.chunkCount).toBeGreaterThan(1);
        expect(data.plan?.totalItemCount).toBe(3);
        expect(data.plan?.excerptCount).toBe(2);
        expect(data.plan?.headingCount).toBe(1);
        expect(
            data.plan?.chunks.every((chunk) => chunk.estimatedTokens <= (data.plan?.availableChunkTokens ?? 0)),
        ).toBe(true);
    });
});

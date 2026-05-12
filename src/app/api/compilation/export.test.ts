import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { strFromU8, unzipSync } from 'fflate';

import { __resetCompilationSnapshotForTests, invalidateCompilationSnapshot } from '@/lib/compilation-cache';

mock.module('bitaboom', () => ({
    estimateTokenCount: (text: string) => text.length,
    LLMProvider: { Gemini: 'gemini', Grok: 'grok', OpenAI: 'openai' },
}));
mock.module('@/lib/prompt-state', () => ({
    getSelectedPrompt: async () => ({
        content: 'Translate every item into English and preserve the IDs exactly.',
        id: 'FATAWA',
    }),
}));

const { GET } = await import('./export');

describe('GET /api/compilation/export', () => {
    let compilationFilePath = '';
    let tempDir = '';

    beforeEach(async () => {
        tempDir = await mkdtemp(path.join(os.tmpdir(), 'rupture-compilation-export-route-'));
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
                footnotes: [{ from: 2, id: 'F1', nass: 'ignored footnote', text: null }],
                headings: [{ from: 3, id: 'H1', nass: 'heading heading heading', text: null }],
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

    it('should return a stripped chunk json with excerpts and headings only', async () => {
        const response = await GET(
            new Request(
                'http://localhost/api/compilation/export?asset=chunk&chunkIndex=1&contextWindowTokens=100000&reservedTokens=100&provider=openai',
            ),
        );
        if (!response) {
            throw new Error('Expected response');
        }
        const json = (await response.json()) as {
            chunkIndex: number;
            excerpts: Array<{ id: string; nass: string }>;
            headings: Array<{ id: string; nass: string }>;
            promptId: string;
        };

        expect(response.status).toBe(200);
        expect(json.promptId).toBe('FATAWA');
        expect(json.excerpts.map((item) => item.id)).toEqual(['P1', 'P2']);
        expect(json.headings.map((item) => item.id)).toEqual(['H1']);
        expect(JSON.stringify(json)).not.toContain('F1');
        expect(Object.keys(json).sort()).toEqual(['chunkIndex', 'excerpts', 'headings', 'promptId']);
    });

    it('should return a zip with the prompt, manifest, and chunk json files', async () => {
        const response = await GET(
            new Request(
                'http://localhost/api/compilation/export?asset=zip&contextWindowTokens=100000&reservedTokens=100&provider=openai',
            ),
        );
        if (!response) {
            throw new Error('Expected response');
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        const files = unzipSync(bytes);
        const fileNames = Object.keys(files).sort();
        const manifestFileName = fileNames.find((fileName) => fileName.endsWith('translation-export-manifest.json'));
        const promptFileName = fileNames.find((fileName) => fileName.endsWith('translation-prompt.txt'));
        const chunkFileName = fileNames.find((fileName) => fileName.includes('translation-chunk-'));

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('application/zip');
        expect(manifestFileName).toBeDefined();
        expect(promptFileName).toBeDefined();
        expect(chunkFileName).toBeDefined();

        const manifest = JSON.parse(strFromU8(files[manifestFileName ?? ''])) as {
            chunkCount: number;
            excerptCount: number;
            headingCount: number;
            promptId: string;
            totalItemCount: number;
        };
        const prompt = strFromU8(files[promptFileName ?? '']);

        expect(manifest.promptId).toBe('FATAWA');
        expect(manifest.totalItemCount).toBe(3);
        expect(manifest.excerptCount).toBe(2);
        expect(manifest.headingCount).toBe(1);
        expect(manifest.chunkCount).toBe(1);
        expect(prompt).toContain('Translate every item into English');
    });
});

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { getInvalidExcerpts, getTranslationStats, summarizeTranslationStats } from './translations-browser';

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

    beforeEach(async () => {
        tempDir = await mkdtemp(path.join(os.tmpdir(), 'rupture-invalid-excerpts-'));
        process.env.TRANSLATIONS_DIR = tempDir;
    });

    afterEach(async () => {
        delete process.env.TRANSLATIONS_DIR;
        if (tempDir) {
            await rm(tempDir, { force: true, recursive: true });
        }
    });

    it('should surface id-scoped invalid rows even when there are no Arabic source segments', async () => {
        await writeFile(
            path.join(tempDir, 'invented.json'),
            JSON.stringify({
                format: 'common',
                llm: 'ChatGPT',
                model: 'gpt-5-4-pro',
                prompt: 'Translate these excerpts carefully.\n\nNo segment markers were preserved here.',
                reasoning: [],
                response: 'P100 - Hallucinated segment',
            }),
        );

        const [stats, invalid] = await Promise.all([getTranslationStats(), getInvalidExcerpts()]);

        expect(stats.invalidFiles).toBe(1);
        expect(invalid.invalidFileCount).toBe(1);
        expect(invalid.rowCount).toBe(1);
        expect(invalid.rows).toEqual([
            expect.objectContaining({
                arabic: null,
                baseTranslation: 'Hallucinated segment',
                errorTypes: ['invented_id'],
                filePath: 'invented.json',
                id: 'P100',
                translation: 'Hallucinated segment',
            }),
        ]);
    });
});

import { describe, expect, it } from 'bun:test';

import { summarizeTranslationStats } from './translations-browser';

describe('summarizeTranslationStats', () => {
    it('should count translated and untranslated files and total applied patches', () => {
        expect(
            summarizeTranslationStats([
                { isValid: true, model: 'gpt-5-4-pro', patchesApplied: 2, path: 'a.json' },
                { isValid: false, model: 'gpt-5-4-pro', patchesApplied: 1, path: 'b.json' },
                { isValid: false, model: undefined, patchesApplied: 0, path: 'c.json' },
            ]),
        ).toEqual({
            files: [
                { isValid: true, model: 'gpt-5-4-pro', patchesApplied: 2, path: 'a.json' },
                { isValid: false, model: 'gpt-5-4-pro', patchesApplied: 1, path: 'b.json' },
                { isValid: false, model: undefined, patchesApplied: 0, path: 'c.json' },
            ],
            invalidByModel: { 'gpt-5-4-pro': 1, unknown: 1 },
            invalidFiles: 2,
            modelBreakdown: { 'gpt-5-4-pro': 2 },
            patchesApplied: 3,
            totalFiles: 3,
            validFiles: 1,
        });
    });
});

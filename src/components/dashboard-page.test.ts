import { describe, expect, it } from 'bun:test';

import { canPackCompilation } from './dashboard-page';

describe('canPackCompilation', () => {
    it('should only allow packing when untranslated segments are zero', () => {
        expect(
            canPackCompilation({
                createdAt: null,
                excerpts: { total: 10, translated: 10, untranslated: 0 },
                headings: { total: 2, translated: 2, untranslated: 0 },
                lastUpdatedAt: null,
                totalSegments: 12,
                translatedSegments: 12,
                uniqueTranslators: 1,
                untranslatedSegments: 0,
                workDurationMs: null,
            }),
        ).toBe(true);

        expect(
            canPackCompilation({
                createdAt: null,
                excerpts: { total: 10, translated: 9, untranslated: 1 },
                headings: { total: 2, translated: 2, untranslated: 0 },
                lastUpdatedAt: null,
                totalSegments: 12,
                translatedSegments: 11,
                uniqueTranslators: 1,
                untranslatedSegments: 1,
                workDurationMs: null,
            }),
        ).toBe(false);

        expect(canPackCompilation(null)).toBe(false);
    });
});

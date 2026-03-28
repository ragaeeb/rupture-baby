import { describe, expect, it } from 'bun:test';

import { summarizeCompilationStats } from './compilation-stats';

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

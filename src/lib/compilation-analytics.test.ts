import { describe, expect, it } from 'bun:test';

import { summarizeCompilationAnalytics } from './compilation-analytics';

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
        expect(analytics.translators).toEqual([
            { count: 3, id: '879', label: 'GPT 5o', percent: 75 },
            { count: 1, id: '890', label: 'Gemini 3.0 Pro', percent: 25 },
        ]);
    });
});

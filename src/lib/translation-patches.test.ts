import { describe, expect, it } from 'bun:test';

import {
    createRupturePatch,
    getRuptureDisplayHighlights,
    getRupturePatchHighlightRanges,
    mergeRuptureHighlightsForDisplay,
} from './translation-patches';

describe('getRupturePatchHighlightRanges', () => {
    it('should highlight only the changed text span in the patched text', () => {
        const patch = createRupturePatch('line one\nline two', 'line one\nline TWO');
        if (!patch) {
            throw new Error('Expected patch to be created');
        }

        expect(getRupturePatchHighlightRanges(patch)).toEqual([{ end: 17, start: 14 }]);
    });
});

describe('mergeRuptureHighlightsForDisplay', () => {
    it('should merge untitled patch highlights separated only by spaces', () => {
        expect(
            mergeRuptureHighlightsForDisplay('estimated  meaning', [
                { range: { end: 9, start: 0 } },
                { range: { end: 18, start: 11 } },
            ]),
        ).toEqual([{ range: { end: 18, start: 0 } }]);
    });

    it('should preserve titled highlights as separate spans', () => {
        expect(
            mergeRuptureHighlightsForDisplay('estimated meaning', [
                { range: { end: 9, start: 0 }, title: 'تقدير' },
                { range: { end: 17, start: 10 } },
            ]),
        ).toEqual([{ range: { end: 9, start: 0 }, title: 'تقدير' }, { range: { end: 17, start: 10 } }]);
    });
});

describe('getRuptureDisplayHighlights', () => {
    it('should merge whitespace-split diff highlights when no explicit metadata highlights exist', () => {
        const patch = createRupturePatch('foo', 'estimated  meaning');
        if (!patch) {
            throw new Error('Expected patch to be created');
        }

        expect(getRuptureDisplayHighlights('estimated  meaning', patch)).toEqual([{ range: { end: 18, start: 0 } }]);
    });
});

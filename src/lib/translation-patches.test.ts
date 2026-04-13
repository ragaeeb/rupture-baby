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

    it('should collapse replacement-like edits into a single highlight span', () => {
        const originalText =
            'The student said that the first explanation was weak and the wording did not match the Arabic very well.';
        const nextText =
            'The shaykh said that this section belongs with the previous excerpt and should be moved to restore the alignment.';
        const patch = createRupturePatch(originalText, nextText);
        if (!patch) {
            throw new Error('Expected patch to be created');
        }

        expect(patch.ops).toHaveLength(1);
        expect(getRuptureDisplayHighlights(nextText, patch)).toEqual([{ range: { end: nextText.length, start: 4 } }]);
    });

    it('should keep separate precise edits when the row is not mostly replaced', () => {
        const patch = createRupturePatch(
            'The student said that the explanation was weak and incomplete.',
            'The student said that the explanation was quite weak and still incomplete.',
        );
        if (!patch) {
            throw new Error('Expected patch to be created');
        }

        expect(patch.ops.length).toBeGreaterThan(1);
    });
});

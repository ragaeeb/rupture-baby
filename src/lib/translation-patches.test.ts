import { describe, expect, it } from 'bun:test';

import { createRupturePatch, getRupturePatchHighlightRanges } from './translation-patches';

describe('getRupturePatchHighlightRanges', () => {
    it('should highlight only the changed text span in the patched text', () => {
        const patch = createRupturePatch('line one\nline two', 'line one\nline TWO');
        if (!patch) {
            throw new Error('Expected patch to be created');
        }

        expect(getRupturePatchHighlightRanges(patch)).toEqual([{ end: 17, start: 14 }]);
    });
});

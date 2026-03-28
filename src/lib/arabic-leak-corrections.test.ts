import { describe, expect, it } from 'bun:test';

import { applyArabicLeakCorrectionsToText } from './arabic-leak-corrections';

describe('applyArabicLeakCorrectionsToText', () => {
    it('should ignore duplicate identical corrections for the same leaked phrase', () => {
        const result = applyArabicLeakCorrectionsToText(
            'P1',
            'He said عليه الصلاة والسلام and then عليه الصلاة والسلام again.',
            [
                {
                    filePath: 'ignored.json',
                    id: 'P1',
                    match: 'عليه الصلاة والسلام',
                    replacement: 'peace and blessings be upon him',
                },
                {
                    filePath: 'ignored.json',
                    id: 'P1',
                    match: 'عليه الصلاة والسلام',
                    replacement: 'peace and blessings be upon him',
                },
            ],
        );

        expect(result.issues).toEqual([]);
        expect(result.nextText).toBe(
            'He said peace and blessings be upon him and then peace and blessings be upon him again.',
        );
        expect(result.replacementHighlights).toHaveLength(2);
        expect(result.rowChanged).toBe(true);
    });
});

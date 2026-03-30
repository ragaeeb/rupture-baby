import { describe, expect, it } from 'bun:test';

import { applyAllCapsCorrectionsToText } from './all-caps-corrections';

describe('applyAllCapsCorrectionsToText', () => {
    it('should only replace exact all-caps spans and preserve the rest of the sentence', () => {
        const result = applyAllCapsCorrectionsToText(
            'P1',
            'He said: «AND THEY KNEW THAT THE BUYER OF IT WILL HAVE NO SHARE IN THE HEREAFTER».',
            [
                {
                    filePath: 'ignored.json',
                    id: 'P1',
                    match: 'AND THEY KNEW THAT THE BUYER OF IT WILL HAVE NO SHARE IN THE HEREAFTER',
                    replacement: 'And they knew that the buyer of it will have no share in the Hereafter',
                },
            ],
            ['AND THEY KNEW THAT THE BUYER OF IT WILL HAVE NO SHARE IN THE HEREAFTER'],
        );

        expect(result.issues).toEqual([]);
        expect(result.nextText).toBe(
            'He said: «And they knew that the buyer of it will have no share in the Hereafter».',
        );
        expect(result.replacementHighlights).toHaveLength(1);
        expect(result.rowChanged).toBe(true);
    });

    it('should reject corrections that are not all caps', () => {
        const result = applyAllCapsCorrectionsToText(
            'P1',
            'He said: «AND THEY KNEW».',
            [{ filePath: 'ignored.json', id: 'P1', match: 'And They Knew', replacement: 'And they knew' }],
            ['AND THEY KNEW'],
        );

        expect(result.rowChanged).toBe(false);
        expect(result.issues[0]).toContain('Skipping non-ALL-CAPS correction');
    });

    it('should reject partial corrections when exact match hints are provided', () => {
        const result = applyAllCapsCorrectionsToText(
            'P1',
            'He said: «AND THEY KNEW THAT THE BUYER OF IT WILL HAVE NO SHARE IN THE HEREAFTER».',
            [
                {
                    filePath: 'ignored.json',
                    id: 'P1',
                    match: 'WILL HAVE NO SHARE IN',
                    replacement: 'will have no share in',
                },
            ],
            ['AND THEY KNEW THAT THE BUYER OF IT WILL HAVE NO SHARE IN THE HEREAFTER'],
        );

        expect(result.rowChanged).toBe(false);
        expect(result.issues[0]).toContain('Skipping unmatched ALL-CAPS correction');
    });
});

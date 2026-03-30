import { describe, expect, it } from 'bun:test';

import { buildArabicLeakCorrectionPrompt, parseArabicLeakCorrectionResponse } from './arabic-leak-prompt';

describe('buildArabicLeakCorrectionPrompt', () => {
    it('should require grammatically correct replacements in sentence context', () => {
        const prompt = buildArabicLeakCorrectionPrompt([
            {
                arabic: 'راجع الكتاب',
                filePath: 'ignored.json',
                id: 'P1',
                matchHints: ['راجع'],
                translation: 'We should راجع the book.',
            },
        ]);

        expect(prompt).toContain('The replacement must fit grammatically and idiomatically');
        expect(prompt).toContain('Return a base verb when the sentence calls for a bare verb');
        expect(prompt).toContain('"We should [ARABIC] the book"');
        expect(prompt).toContain('return that correction only ONCE for that passage');
        expect(prompt).toContain('Do not emit duplicate correction objects');
        expect(prompt).not.toContain('ignored.json');
    });

    it('should de-dupe identical corrections for the same excerpt id when parsing results maps', () => {
        const corrections = parseArabicLeakCorrectionResponse(
            JSON.stringify({
                results: {
                    P1: [
                        { match: 'عليه الصلاة والسلام', replacement: 'peace and blessings be upon him' },
                        { match: 'عليه الصلاة والسلام', replacement: 'peace and blessings be upon him' },
                    ],
                    P2: [{ match: 'القول', replacement: 'claim' }],
                },
            }),
        );

        expect(corrections).toEqual([
            { id: 'P1', match: 'عليه الصلاة والسلام', replacement: 'peace and blessings be upon him' },
            { id: 'P2', match: 'القول', replacement: 'claim' },
        ]);
    });

    it('should recover the first balanced json object when the model appends trailing junk', () => {
        const corrections = parseArabicLeakCorrectionResponse(
            '{"results":{"P126559b":[{"match":"عليه الصلاة والسلام","replacement":"peace and blessings of Allah be upon him"}],"P125565":[{"match":"هؤلاء","replacement":"these people"}],"P125765":[{"match":"القول","replacement":"claim"}]}}]}',
        );

        expect(corrections).toEqual([
            { id: 'P126559b', match: 'عليه الصلاة والسلام', replacement: 'peace and blessings of Allah be upon him' },
            { id: 'P125565', match: 'هؤلاء', replacement: 'these people' },
            { id: 'P125765', match: 'القول', replacement: 'claim' },
        ]);
    });
});

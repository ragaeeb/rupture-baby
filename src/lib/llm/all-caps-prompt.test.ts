import { describe, expect, it } from 'bun:test';

import { buildAllCapsCorrectionPrompt } from './all-caps-prompt';

describe('buildAllCapsCorrectionPrompt', () => {
    it('should require exact hint matches and forbid splitting one hint into smaller corrections', () => {
        const prompt = buildAllCapsCorrectionPrompt([
            {
                arabic: 'نص عربي',
                filePath: 'ignored.json',
                id: 'P1',
                matchHints: ['AND THEY KNEW THAT THE BUYER OF IT WILL HAVE NO SHARE IN THE HEREAFTER'],
                translation: 'He said: «AND THEY KNEW THAT THE BUYER OF IT WILL HAVE NO SHARE IN THE HEREAFTER».',
            },
        ]);

        expect(prompt).toContain('every returned "match" must exactly equal one of those hint strings');
        expect(prompt).toContain('Never split a single hint into multiple smaller corrections');
        expect(prompt).toContain('the set of returned "match" values must be a subset of those hint strings');
        expect(prompt).not.toContain('ignored.json');
    });
});

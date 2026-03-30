import { describe, expect, it } from 'bun:test';

import { validateTranslationResponse } from './utils';

describe('validateTranslationResponse', () => {
    it('should expose segment-relative ranges for content validation errors', () => {
        const result = validateTranslationResponse([{ id: 'P1', text: 'نص عربي' }], 'P1 - hello بد world');

        expect(result.errors).toContainEqual(
            expect.objectContaining({
                id: 'P1',
                matchText: 'بد',
                segmentRange: { end: 8, start: 6 },
                type: 'arabic_leak',
            }),
        );
    });

    it('should flag consecutive Arabic words as one leak block', () => {
        const result = validateTranslationResponse(
            [{ id: 'P1', text: 'نص عربي' }],
            'P1 - this is the وجه استشهاد المؤلف بهذه الآية, for it indicates',
        );

        expect(result.errors).toContainEqual(
            expect.objectContaining({ id: 'P1', matchText: 'وجه استشهاد المؤلف بهذه الآية', type: 'arabic_leak' }),
        );
    });

    it('should flag the full all-caps span instead of fragmenting it into threshold-sized chunks', () => {
        const result = validateTranslationResponse(
            [{ id: 'P1', text: 'نص عربي' }],
            'P1 - He said: «AND THEY KNEW THAT THE BUYER OF IT WILL HAVE NO SHARE IN THE HEREAFTER».',
        );

        const allCapsErrors = result.errors.filter((error) => error.type === 'all_caps');
        expect(allCapsErrors).toHaveLength(1);
        expect(allCapsErrors[0]).toEqual(
            expect.objectContaining({
                id: 'P1',
                matchText: 'AND THEY KNEW THAT THE BUYER OF IT WILL HAVE NO SHARE IN THE HEREAFTER',
                type: 'all_caps',
            }),
        );
    });

    it('should include hyphenated uppercase transliterations in a single all-caps span', () => {
        const result = validateTranslationResponse(
            [{ id: 'P1', text: 'نص عربي' }],
            'P1 - He said: «THEY BELIEVE IN AL-JIBT AND AL-ṬĀGHŪT».',
        );

        expect(result.errors).toContainEqual(
            expect.objectContaining({ id: 'P1', matchText: 'THEY BELIEVE IN AL-JIBT AND AL-ṬĀGHŪT', type: 'all_caps' }),
        );
    });
});

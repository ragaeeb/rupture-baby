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
});

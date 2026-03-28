import { describe, expect, it } from 'bun:test';

import { createRupturePatch } from './translation-patches';
import {
    analyzeTranslationValidity,
    getVisibleTranslationValidityErrors,
    isTranslationValidityAnalysisInvalid,
} from './translation-validity';

describe('translation validity visibility', () => {
    it('should ignore row-level validation errors for excerpts that already have saved patches', () => {
        const patch = createRupturePatch('bad leak مرحبا', 'still bad مرحبا');
        if (!patch) {
            throw new Error('Expected patch to be created');
        }

        const analysis = analyzeTranslationValidity(
            JSON.stringify({
                __rupture: { patches: { P1: patch } },
                format: 'common',
                llm: 'ChatGPT',
                model: 'gpt-5-4-pro',
                prompt: 'Translate carefully.\n\nP1 - نص عربي',
                reasoning: [],
                response: 'P1 - bad leak مرحبا',
            }),
        );

        expect(
            analysis.validation.validationErrors.some((error) => error.type === 'arabic_leak' && error.id === 'P1'),
        ).toBe(true);
        expect(getVisibleTranslationValidityErrors(analysis)).toEqual([]);
        expect(isTranslationValidityAnalysisInvalid(analysis)).toBe(false);
    });

    it('should still treat unpatched row-level validation errors as invalid', () => {
        const analysis = analyzeTranslationValidity(
            JSON.stringify({
                format: 'common',
                llm: 'ChatGPT',
                model: 'gpt-5-4-pro',
                prompt: 'Translate carefully.\n\nP1 - نص عربي',
                reasoning: [],
                response: 'P1 - bad leak مرحبا',
            }),
        );

        expect(getVisibleTranslationValidityErrors(analysis).some((error) => error.type === 'arabic_leak')).toBe(true);
        expect(isTranslationValidityAnalysisInvalid(analysis)).toBe(true);
    });
});

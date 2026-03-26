import { describe, expect, it } from 'bun:test';
import { buildTranslationTableModel } from './translation-file-view-model';
import { parseTranslationToCommon } from './translation-parser';
import { createRupturePatch } from './translation-patches';

describe('buildTranslationTableModel', () => {
    it('should apply saved rupture patches to translation rows', () => {
        const patch = createRupturePatch('bad translation', 'fixed translation');
        if (!patch) {
            throw new Error('Expected patch to be created');
        }

        const rawInput = {
            __rupture: { patches: { P1: patch } },
            format: 'common',
            llm: 'ChatGPT',
            model: 'gpt-5-4-pro',
            prompt: 'Translate carefully.\n\nP1 - نص عربي',
            reasoning: [],
            response: 'P1 - bad translation',
        };

        const conversation = parseTranslationToCommon(rawInput);
        const model = buildTranslationTableModel(conversation, {});
        if (!model) {
            throw new Error('Expected table model to be created');
        }

        expect(model.rows).toHaveLength(1);
        expect(model.rows[0]?.translatedText).toBe('fixed translation');
        expect(model.hasPatches).toBe(true);
        expect(model.patchedRowCount).toBe(1);
        expect(model.rows[0]?.hasPatch).toBe(true);
        expect(model.rows[0]?.patchHighlightRanges.length).toBeGreaterThan(0);
    });
});

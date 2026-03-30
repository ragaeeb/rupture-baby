import { describe, expect, it } from 'bun:test';
import { buildTranslationTableModel, updatePendingEdits } from './translation-file-view-model';
import { parseTranslationToCommon } from './translation-parser';
import { createRupturePatch } from './translation-patches';
import { analyzeTranslationValidity } from './translation-validity';

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
        expect(model.rows[0]?.patchHighlights.length).toBeGreaterThan(0);
    });

    it('should keep pending edits for rows with missing translations', () => {
        const conversation = parseTranslationToCommon({
            format: 'common',
            llm: 'ChatGPT',
            model: 'gpt-5-4-pro',
            prompt: 'Translate carefully.\n\nP1 - نص عربي',
            reasoning: [],
            response: '',
        });

        const pendingEdits = updatePendingEdits({}, 'P1', '', 'Inserted translation');
        const model = buildTranslationTableModel(conversation, pendingEdits);
        if (!model) {
            throw new Error('Expected table model to be created');
        }

        expect(model.rows).toHaveLength(1);
        expect(model.rows[0]?.isMissingTranslation).toBe(false);
        expect(model.rows[0]?.translatedText).toBe('Inserted translation');
        expect(model.rows[0]?.isDirty).toBe(true);
        expect(model.rows[0]?.hasPatch).toBe(true);
    });
});

describe('analyzeTranslationValidity', () => {
    it('should apply saved patches for rows that were missing in the original response', () => {
        const patch = createRupturePatch('', 'Inserted translation');
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
                response: '',
            }),
        );

        expect(analysis.translatedById.get('P1')).toBe('Inserted translation');
        expect(analysis.patchedExcerptIds.has('P1')).toBe(true);
    });
});

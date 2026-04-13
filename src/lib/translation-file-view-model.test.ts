import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
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

    it('should mark skipped rows and hide their validation errors', () => {
        const conversation = parseTranslationToCommon({
            __rupture: { skip: ['P1'] },
            format: 'common',
            llm: 'ChatGPT',
            model: 'gpt-5-4-pro',
            prompt: 'Translate carefully.\n\nP1 - نص عربي',
            reasoning: [],
            response: 'P1 - bad leak مرحبا',
        });

        const model = buildTranslationTableModel(conversation, {});
        if (!model) {
            throw new Error('Expected table model to be created');
        }

        expect(model.isValid).toBe(true);
        expect(model.rows[0]?.isSkipped).toBe(true);
        expect(model.rows[0]?.validationMessages).toEqual([]);
    });

    it('should include every Arabic leak hint for excerpts with multiple leak spans', () => {
        const conversation = parseTranslationToCommon({
            format: 'common',
            llm: 'ChatGPT',
            model: 'gpt-5-4-pro',
            prompt: 'Translate carefully.\n\nP1 - نص عربي',
            reasoning: [],
            response: 'P1 - First paragraph ends with مرحبا.\n\nSecond paragraph ends with مع السلامة.',
        });

        const model = buildTranslationTableModel(conversation, {}, '/tmp/test.json');
        if (!model) {
            throw new Error('Expected table model to be created');
        }

        expect(model.arabicLeakExcerpts).toEqual([
            expect.objectContaining({
                id: 'P1',
                matchHints: ['مرحبا', 'مع السلامة'],
            }),
        ]);
    });

    it('should flag when the source block had to be aligned to the response block', () => {
        const conversation = parseTranslationToCommon({
            format: 'common',
            llm: 'ChatGPT',
            model: 'gpt-5-4-pro',
            prompt: 'Example block\n\nP1 - example one\n\nP2 - example two\n\nP3 - example three\n\nP1 - نص عربي ١\n\nP2 - نص عربي ٢\n\nP3 - نص عربي ٣',
            reasoning: [],
            response: 'P1 - first\n\nP2 - second\n\nP3 - third',
        });

        const model = buildTranslationTableModel(conversation, {});
        if (!model) {
            throw new Error('Expected table model to be created');
        }

        expect(model.isSourceAlignedToResponse).toBeTrue();
        expect(model.sourceIds).toEqual(['P1', 'P2', 'P3']);
    });

    it('should not synthesize translated response ids from prompt instruction examples', () => {
        const filePath =
            '/Users/rhaq/workspace/compilations/translations/Translation_of_Islamic_Texts_2026-04-09_23-43-27.json';
        const conversation = parseTranslationToCommon(JSON.parse(readFileSync(filePath, 'utf8')));

        const model = buildTranslationTableModel(conversation, {}, filePath);
        if (!model) {
            throw new Error('Expected table model to be created');
        }

        expect(model.responseIds.slice(0, 5)).toEqual([
            'P214846a',
            'P214847',
            'P214848',
            'P214848a',
            'P214848b',
        ]);
        expect(model.sourceIds.slice(0, 5)).toEqual([
            'P214846a',
            'P214847',
            'P214848',
            'P214848a',
            'P214848b',
        ]);
    });

    it('should resolve the real source block even when the response invents an extra id', () => {
        const filePath = '/Users/rhaq/workspace/compilations/translations/Translation_of_Islamic_Texts_2026-04-09_23-43-27.json';
        const conversation = parseTranslationToCommon(JSON.parse(readFileSync(filePath, 'utf8')));

        const model = buildTranslationTableModel(conversation, {}, filePath);
        if (!model) {
            throw new Error('Expected table model to be created');
        }

        expect(model.sourceIds.slice(0, 5)).toEqual([
            'P214846a',
            'P214847',
            'P214848',
            'P214848a',
            'P214848b',
        ]);
        expect(model.sourceIds).not.toContain('P1234');
        expect(model.sourceIds).not.toContain('P405');
        expect(model.sourceIds).not.toContain('P5455');
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

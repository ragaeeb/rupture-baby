import { describe, expect, it } from 'bun:test';

import type { Compilation } from '@/types/compilation';

import { finalizeSavedCompilation } from './compilation-playback';
import { parseTranslationToCommon, validateConversationExcerpts } from './translation-parser';
import { getPlayableTranslationExcerpts } from './translation-validity';

describe('finalizeSavedCompilation', () => {
    it('should stamp the saved compilation with a top-level lastUpdatedAt in Unix seconds', () => {
        const compilation: Compilation = {
            contractVersion: '1',
            createdAt: 1_770_261_381,
            excerpts: [],
            footnotes: [],
            headings: [],
            lastUpdatedAt: 1_770_261_381,
            options: {},
            postProcessingApps: [],
        };

        const savedCompilation = finalizeSavedCompilation(compilation, 1_770_300_000);

        expect(savedCompilation.lastUpdatedAt).toBe(1_770_300_000);
        expect(savedCompilation.createdAt).toBe(1_770_261_381);
    });

    it('should omit skipped excerpts from playback candidates', () => {
        const parsed = parseTranslationToCommon({
            __rupture: { skip: ['P2'] },
            format: 'common',
            llm: 'ChatGPT',
            model: 'gpt-5-4-pro',
            prompt: 'Translate carefully.\n\nP1 - نص عربي ١\n\nP2 - نص عربي ٢',
            reasoning: [],
            response: 'P1 - first translation\n\nP2 - second translation',
        });

        const validation = validateConversationExcerpts(parsed);
        const playableExcerpts = getPlayableTranslationExcerpts({
            baseTranslatedById: new Map(),
            model: parsed.model,
            parsed,
            patchedExcerptIds: new Set(),
            skippedExcerptIds: new Set(['P2']),
            translatedById: new Map(validation.excerpts.map((excerpt) => [excerpt.id, excerpt.text ?? ''] as const)),
            validation,
        });

        expect(playableExcerpts.map((excerpt) => excerpt.id)).toEqual(['P1']);
    });
});

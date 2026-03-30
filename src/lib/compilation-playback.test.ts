import { describe, expect, it } from 'bun:test';

import type { Compilation } from '@/types/compilation';

import { finalizeSavedCompilation } from './compilation-playback';

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
});

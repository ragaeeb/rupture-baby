import { describe, expect, it, mock } from 'bun:test';

import { MissingPathConfigError } from '@/lib/data-paths';

const state = {
    model: { id: 'm1', label: 'Model', provider: 'openai' },
    excerpts: [{ id: '1', nass: 'abc' }],
};

mock.module('bitaboom', () => ({
    estimateTokenCount: (text: string) => text.length,
}));

mock.module('@/lib/translation-models', () => ({
    DEFAULT_MODEL_ID: 'm1',
    getTranslationModelById: () => state.model,
}));

mock.module('@/lib/untranslated-cache', () => ({
    getCachedUntranslatedExcerpts: async () => state.excerpts,
}));

const { GET } = await import('./route');

describe('GET /api/compilation/excerpts/payload', () => {
    it('should build payload response', async () => {
        state.model = { id: 'm1', label: 'Model', provider: 'openai' };
        state.excerpts = [{ id: '1', nass: 'abc' }];

        const response = await GET(new Request('http://localhost/api/compilation/excerpts/payload?maxTokens=100000&maxItems=10'));
        const json = (await response.json()) as { excerptCount: number; payload: string };

        expect(response.status).toBe(200);
        expect(json.excerptCount).toBe(1);
        expect(json.payload).toContain('translate');
        expect(json.payload).toContain('1 - abc');
    });

    it('should return 400 when compilation path is missing', async () => {
        mock.module('@/lib/untranslated-cache', () => ({
            getCachedUntranslatedExcerpts: async () => {
                throw new MissingPathConfigError('compilationFilePath');
            },
        }));

        const { GET: GetWithError } = await import(`./route?case=missing-path-${Date.now()}`);
        const response = await GetWithError(new Request('http://localhost/api/compilation/excerpts/payload'));
        const json = (await response.json()) as { key: string };

        expect(response.status).toBe(400);
        expect(json.key).toBe('compilationFilePath');
    });
});

import { describe, expect, it, mock } from 'bun:test';

import { MissingPathConfigError } from '@/lib/data-paths';

type MockExcerpt = {
    id: string;
    nass: string;
    from?: number;
    to?: number;
};

const state = {
    model: { id: 'm1', label: 'Model', provider: 'openai' },
    prompt: { id: 'p1', content: 'translate' },
    excerpts: [{ id: '1', nass: 'aaa' }, { id: '2', nass: 'bbb' }] as MockExcerpt[],
};

mock.module('bitaboom', () => ({
    estimateTokenCount: (text: string) => text.length,
}));

mock.module('@/lib/translation-models', () => ({
    DEFAULT_MODEL_ID: 'm1',
    getTranslationModelById: () => state.model,
}));

mock.module('@/lib/grouping', () => ({
    groupIdsByTokenLimits: (ids: string[]) => [{ label: 'Group', limit: 100, ids, lastIndex: ids.length - 1 }],
}));

mock.module('@/lib/untranslated-cache', () => ({
    getCachedUntranslatedExcerpts: async () => state.excerpts,
    getCachedUntranslatedPickerItems: async () => state.excerpts,
}));

const { GET } = await import('./route');

describe('GET /api/compilation/excerpts', () => {
    it('should return paginated untranslated excerpts data', async () => {
        const response = await GET(new Request('http://localhost/api/compilation/excerpts?page=1&pageSize=1&maxIds=10'));
        const json = (await response.json()) as { data: MockExcerpt[]; pagination: { totalItems: number }; picker: { displayedTotal: number } };

        expect(response.status).toBe(200);
        expect(json.data.length).toBe(1);
        expect(json.pagination.totalItems).toBe(2);
        expect(json.picker.displayedTotal).toBe(2);
    });

    it('should return 400 when compilation path is missing', async () => {
        mock.module('@/lib/untranslated-cache', () => ({
            getCachedUntranslatedExcerpts: async () => {
                throw new MissingPathConfigError('compilationFilePath');
            },
            getCachedUntranslatedPickerItems: async () => [],
        }));

        const { GET: GetWithError } = await import(`./route?case=missing-path-${Date.now()}`);
        const response = await GetWithError(new Request('http://localhost/api/compilation/excerpts'));
        const json = (await response.json()) as { key: string };

        expect(response.status).toBe(400);
        expect(json.key).toBe('compilationFilePath');
    });
});

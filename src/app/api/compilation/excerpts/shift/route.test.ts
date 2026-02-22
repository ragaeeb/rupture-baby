import { describe, expect, it, mock } from 'bun:test';

import { MissingPathConfigError } from '@/lib/data-paths';

const state = {
    getShiftCache: async () => ({ prompt: 'prompt', queue: [{ id: '1', nass: 'a' }], mtimeMs: 1, filePath: '/tmp/a.json' }),
    buildShiftPayload: () => ({ payload: 'ok', shiftCount: 1, usedTokens: 5 }),
    shiftedCount: -1,
};

mock.module('@/lib/shift-cache', () => ({
    getShiftCache: () => state.getShiftCache(),
}));

mock.module('@/lib/shift-payload', () => ({
    buildShiftPayload: () => state.buildShiftPayload(),
    shiftFirstN: (_queue: unknown[], count: number) => {
        state.shiftedCount = count;
        return [];
    },
}));

const { GET } = await import('./route');

describe('GET /api/compilation/excerpts/shift', () => {
    it('should return shift payload text', async () => {
        state.getShiftCache = async () => ({ prompt: 'prompt', queue: [{ id: '1', nass: 'a' }], mtimeMs: 1, filePath: '/tmp/a.json' });
        state.buildShiftPayload = () => ({ payload: 'payload-text', shiftCount: 1, usedTokens: 7 });
        state.shiftedCount = -1;

        const response = await GET(new Request('http://localhost/api/compilation/excerpts/shift?provider=openai&maxTokens=7000'));
        const body = await response.text();

        expect(response.status).toBe(200);
        expect(body).toBe('payload-text');
        expect(state.shiftedCount).toBe(1);
        expect(response.headers.get('content-type')).toContain('text/plain');
    });

    it('should return 400 when compilation path is missing', async () => {
        state.getShiftCache = async () => {
            throw new MissingPathConfigError('compilationFilePath');
        };

        const response = await GET(new Request('http://localhost/api/compilation/excerpts/shift?provider=openai&maxTokens=7000'));
        const json = (await response.json()) as { error: string; key: string };

        expect(response.status).toBe(400);
        expect(json.key).toBe('compilationFilePath');
    });
});

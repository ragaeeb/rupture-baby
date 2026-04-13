import { describe, expect, it, mock } from 'bun:test';

import { MissingPathConfigError } from '@/lib/data-paths';

const state = {
    buildShiftPayload: () => ({ payload: 'ok', shiftCount: 1, usedTokens: 5 }),
    getShiftCache: async () => ({
        filePath: '/tmp/a.json',
        mtimeMs: 1,
        prompt: 'prompt',
        shiftedCount: 0,
        shiftedIds: [] as string[],
        queue: [{ id: '1', nass: 'a' }],
    }),
    savedShiftedIds: [] as string[],
    savedShiftedCount: -1,
    shiftedCount: -1,
};

mock.module('@/lib/shift-cache', () => ({
    getShiftCache: () => state.getShiftCache(),
    saveShiftCheckpoint: async (_filePath: string, _mtimeMs: number, shiftedCount: number, shiftedIds: string[]) => {
        state.savedShiftedCount = shiftedCount;
        state.savedShiftedIds = shiftedIds;
    },
}));

mock.module('@/lib/shift-payload', () => ({
    buildShiftPayload: () => state.buildShiftPayload(),
    shiftFirstN: (queue: Array<{ id: string; nass: string }>, count: number) => {
        state.shiftedCount = count;
        return queue.splice(0, count);
    },
}));

const { GET } = await import('./shift');

describe('GET /api/compilation/excerpts/shift', () => {
    it('should return shift payload text', async () => {
        state.getShiftCache = async () => ({
            filePath: '/tmp/a.json',
            mtimeMs: 1,
            prompt: 'prompt',
            shiftedCount: 0,
            shiftedIds: [] as string[],
            queue: [{ id: '1', nass: 'a' }],
        });
        state.buildShiftPayload = () => ({ payload: 'payload-text', shiftCount: 1, usedTokens: 7 });
        state.savedShiftedIds = [];
        state.savedShiftedCount = -1;
        state.shiftedCount = -1;

        const response = await GET(
            new Request('http://localhost/api/compilation/excerpts/shift?provider=openai&maxTokens=7000'),
        );
        const body = await response.text();

        expect(response.status).toBe(200);
        expect(body).toBe('payload-text');
        expect(state.shiftedCount).toBe(1);
        expect(state.savedShiftedCount).toBe(1);
        expect(state.savedShiftedIds).toEqual(['1']);
        expect(response.headers.get('content-type')).toContain('text/plain');
    });

    it('should return 400 when compilation path is missing', async () => {
        state.getShiftCache = async () => {
            throw new MissingPathConfigError('compilationFilePath');
        };

        const response = await GET(
            new Request('http://localhost/api/compilation/excerpts/shift?provider=openai&maxTokens=7000'),
        );
        const json = (await response.json()) as { error: string; key: string };

        expect(response.status).toBe(400);
        expect(json.key).toBe('compilationFilePath');
    });

    it('should use headings and footnotes after excerpts are exhausted', async () => {
        state.getShiftCache = async () => ({
            filePath: '/tmp/a.json',
            mtimeMs: 1,
            prompt: 'prompt',
            shiftedCount: 0,
            shiftedIds: [] as string[],
            queue: [
                { id: 'H1', nass: 'heading one' },
                { id: 'H2', nass: 'heading two' },
                { id: 'F1', nass: 'footnote one' },
            ],
        });
        state.buildShiftPayload = () => ({ payload: 'fallback-payload', shiftCount: 3, usedTokens: 13 });
        state.savedShiftedIds = [];
        state.savedShiftedCount = -1;
        state.shiftedCount = -1;

        const response = await GET(
            new Request('http://localhost/api/compilation/excerpts/shift?provider=openai&maxTokens=7000'),
        );
        const body = await response.text();

        expect(response.status).toBe(200);
        expect(body).toBe('fallback-payload');
        expect(state.shiftedCount).toBe(3);
        expect(state.savedShiftedCount).toBe(3);
        expect(state.savedShiftedIds).toEqual(['H1', 'H2', 'F1']);
    });

    it('should accumulate the persisted shift count across requests in the same process', async () => {
        const shiftCache = {
            filePath: '/tmp/a.json',
            mtimeMs: 1,
            prompt: 'prompt',
            shiftedCount: 10,
            shiftedIds: [] as string[],
            queue: [
                { id: 'P1', nass: 'excerpt one' },
                { id: 'P2', nass: 'excerpt two' },
            ],
        };
        state.getShiftCache = async () => shiftCache;
        state.buildShiftPayload = () => ({ payload: 'payload-text', shiftCount: 1, usedTokens: 7 });
        state.savedShiftedIds = [];
        state.savedShiftedCount = -1;
        state.shiftedCount = -1;

        await GET(new Request('http://localhost/api/compilation/excerpts/shift?provider=openai&maxTokens=7000'));
        await GET(new Request('http://localhost/api/compilation/excerpts/shift?provider=openai&maxTokens=7000'));

        expect(shiftCache.shiftedCount).toBe(12);
        expect(shiftCache.shiftedIds).toEqual(['P1', 'P2']);
        expect(state.savedShiftedCount).toBe(12);
        expect(state.savedShiftedIds).toEqual(['P1', 'P2']);
    });
});

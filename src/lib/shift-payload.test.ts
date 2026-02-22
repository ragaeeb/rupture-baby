import { describe, expect, it } from 'bun:test';
import type { LLMProvider } from 'bitaboom';

import { buildShiftPayload, shiftFirstN, type ShiftExcerpt } from './shift-payload';

const mockEstimateTokenCount = (text: string): number => text.length;
const TEST_PROVIDER = 'openai' as LLMProvider;

describe('buildShiftPayload', () => {
    it('should fit consecutive excerpts under the hard token limit', () => {
        const excerpts: ShiftExcerpt[] = [
            { id: 'A1', nass: 'aa' },
            { id: 'A2', nass: 'bbb' },
            { id: 'A3', nass: 'cccc' },
        ];

        const result = buildShiftPayload({
            excerpts,
            maxTokens: 20,
            prompt: 'pp',
            provider: TEST_PROVIDER,
            tokenEstimator: mockEstimateTokenCount,
        });

        expect(result.shiftCount).toBe(2);
        expect(result.usedTokens).toBe(17);
        expect(result.payload).toBe('pp\n\nA1 - aa\n\nA2 - bbb');
    });

    it('should stop before the first excerpt that exceeds the limit', () => {
        const excerpts: ShiftExcerpt[] = [
            { id: 'A1', nass: 'aaaaa' },
            { id: 'A2', nass: 'bb' },
        ];

        const result = buildShiftPayload({
            excerpts,
            maxTokens: 12,
            prompt: 'prompt',
            provider: TEST_PROVIDER,
            tokenEstimator: mockEstimateTokenCount,
        });

        expect(result.shiftCount).toBe(0);
        expect(result.usedTokens).toBe(6);
        expect(result.payload).toBe('prompt');
    });

    it('should return empty payload when prompt alone exceeds the hard limit', () => {
        const result = buildShiftPayload({
            excerpts: [{ id: 'A1', nass: 'aa' }],
            maxTokens: 3,
            prompt: 'prompt',
            provider: TEST_PROVIDER,
            tokenEstimator: mockEstimateTokenCount,
        });

        expect(result.shiftCount).toBe(0);
        expect(result.usedTokens).toBe(0);
        expect(result.payload).toBe('');
    });
});

describe('shiftFirstN', () => {
    it('should shift the first N items from the queue in order', () => {
        const queue: ShiftExcerpt[] = [
            { id: 'A1', nass: 'aa' },
            { id: 'A2', nass: 'bb' },
            { id: 'A3', nass: 'cc' },
        ];

        const shifted = shiftFirstN(queue, 2);

        expect(shifted).toEqual([
            { id: 'A1', nass: 'aa' },
            { id: 'A2', nass: 'bb' },
        ]);
        expect(queue).toEqual([{ id: 'A3', nass: 'cc' }]);
    });
});

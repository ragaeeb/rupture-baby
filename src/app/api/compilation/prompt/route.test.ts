import { describe, expect, it } from 'bun:test';

import { getPromptOptions } from '@/lib/prompt-state';

import { GET, POST } from './route';

describe('GET /api/compilation/prompt', () => {
    it('should return selected prompt id', async () => {
        const response = await GET();
        const json = (await response.json()) as { selectedPromptId: string };

        expect(response.status).toBe(200);
        expect(typeof json.selectedPromptId).toBe('string');
        expect(json.selectedPromptId.length).toBeGreaterThan(0);
    });
});

describe('POST /api/compilation/prompt', () => {
    it('should reject missing promptId', async () => {
        const request = new Request('http://localhost/api/compilation/prompt', {
            body: JSON.stringify({}),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
        });

        const response = await POST(request);
        const json = (await response.json()) as { error: string };

        expect(response.status).toBe(400);
        expect(json.error).toContain('promptId is required');
    });

    it('should set a valid prompt', async () => {
        const validPromptId = (await getPromptOptions())[0]?.id;
        expect(validPromptId).toBeDefined();

        const request = new Request('http://localhost/api/compilation/prompt', {
            body: JSON.stringify({ promptId: validPromptId }),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
        });

        const response = await POST(request);
        const json = (await response.json()) as { selectedPromptId: string };

        expect(response.status).toBe(200);
        expect(json.selectedPromptId).toBe(validPromptId);
    });
});

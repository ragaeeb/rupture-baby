import { describe, expect, it, mock } from 'bun:test';

const MOCK_PROMPT_ID = 'FATAWA';
const MOCK_PROMPT_CONTENT = 'Translate the following carefully.';

const state = { selectedPromptId: MOCK_PROMPT_ID };

const mockPrompts = [
    { content: MOCK_PROMPT_CONTENT, id: MOCK_PROMPT_ID, name: 'Fatawa' },
    { content: 'Another prompt.', id: 'FIQH', name: 'Fiqh' },
];

mock.module('@/lib/prompt-state', () => ({
    getPromptOptions: async () => mockPrompts,
    getSelectedPrompt: async () => mockPrompts.find((p) => p.id === state.selectedPromptId) ?? mockPrompts[0],
    setSelectedPrompt: async ({ promptId }: { content: string; promptId: string }) => {
        const found = mockPrompts.find((p) => p.id === promptId) ?? null;
        if (found) {
            state.selectedPromptId = found.id;
        }
        return found;
    },
    setSelectedPromptById: async (promptId: string) => {
        const found = mockPrompts.find((p) => p.id === promptId) ?? null;
        if (found) {
            state.selectedPromptId = found.id;
        }
        return found;
    },
}));

const { GET, POST } = await import('./prompt');

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
        const validPromptId = mockPrompts[0]?.id;
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

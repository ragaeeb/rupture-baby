import type { TranslationApiResponse } from './translation-picker-types';

export const PAGE_SIZE = 5;
export const DEFAULT_MAX_IDS = 500;

export const fetchExcerptsResponse = async (params: {
    maxIds: number;
    modelId: string;
    page: number;
    selectedEndIndex: number | null;
}) => {
    const searchParams = new URLSearchParams({
        maxIds: String(params.maxIds),
        modelId: params.modelId,
        page: String(params.page),
        pageSize: String(PAGE_SIZE),
    });
    if (params.selectedEndIndex !== null) {
        searchParams.set('selectedEndIndex', String(params.selectedEndIndex));
    }

    const response = await fetch(`/api/compilation/excerpts?${searchParams.toString()}`);
    if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
    }

    return (await response.json()) as TranslationApiResponse;
};

export const setBackendPrompt = async (promptId: string) => {
    const response = await fetch('/api/compilation/prompt', {
        body: JSON.stringify({ promptId }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });

    if (!response.ok) {
        throw new Error(`Failed to set prompt with status ${response.status}`);
    }
};

export const getBackendPrompt = async (): Promise<string> => {
    const response = await fetch('/api/compilation/prompt');
    if (!response.ok) {
        throw new Error(`Failed to load prompt with status ${response.status}`);
    }

    const json = (await response.json()) as { selectedPromptId?: string };
    return json.selectedPromptId ?? '';
};

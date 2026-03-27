import '@tanstack/react-start/server-only';

import { createFileRoute } from '@tanstack/react-router';
import { estimateTokenCount } from 'bitaboom';

import { MissingPathConfigError } from '@/lib/data-paths';
import { getSelectedPrompt } from '@/lib/prompt-state';
import { DEFAULT_MODEL_ID, getTranslationModelById } from '@/lib/translation-models';
import { getCachedUntranslatedExcerpts } from '@/lib/untranslated-cache';

const DEFAULT_MAX_TOKENS = 4000;
const MAX_MAX_TOKENS = 200000;
const DEFAULT_MAX_ITEMS = 10000;
const MAX_MAX_ITEMS = 100000;

const parsePositiveInt = (value: string | null, fallback: number): number => {
    if (!value) {
        return fallback;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
        return fallback;
    }

    return parsed;
};

const estimateLineTokens = (id: string, nass: string, provider: Parameters<typeof estimateTokenCount>[1]): number => {
    const overheadChars = id.length + 4;
    return estimateTokenCount(nass, provider) + Math.ceil(overheadChars / 4);
};

export const GET = async (request: Request) => {
    try {
        const { searchParams } = new URL(request.url);
        const maxTokens = Math.min(parsePositiveInt(searchParams.get('maxTokens'), DEFAULT_MAX_TOKENS), MAX_MAX_TOKENS);
        const maxItems = Math.min(parsePositiveInt(searchParams.get('maxItems'), DEFAULT_MAX_ITEMS), MAX_MAX_ITEMS);
        const modelId = searchParams.get('modelId') ?? DEFAULT_MODEL_ID;
        const selectedModel = getTranslationModelById(modelId);

        if (!selectedModel) {
            return Response.json({ error: `Invalid modelId "${modelId}".` }, { status: 400 });
        }

        const selectedPrompt = await getSelectedPrompt();
        const prompt = selectedPrompt.content.trim();
        const baseTokens = estimateTokenCount(prompt, selectedModel.provider);
        const untranslatedExcerpts = await getCachedUntranslatedExcerpts();

        const selectedLines: string[] = [];
        const selectedIds: string[] = [];
        let usedTokens = baseTokens;

        for (const excerpt of untranslatedExcerpts.slice(0, maxItems)) {
            const lineTokens = estimateLineTokens(excerpt.id, excerpt.nass, selectedModel.provider);
            if (usedTokens + lineTokens > maxTokens) {
                break;
            }

            usedTokens += lineTokens;
            selectedIds.push(excerpt.id);
            selectedLines.push(`${excerpt.id} - ${excerpt.nass}`);
        }

        const payload = prompt.length > 0 ? `${prompt}\n\n${selectedLines.join('\n')}` : selectedLines.join('\n');

        return Response.json({
            excerptCount: selectedLines.length,
            excerptIds: selectedIds,
            maxItems,
            maxTokens,
            model: selectedModel,
            payload,
            promptId: selectedPrompt.id,
            usedTokens,
        });
    } catch (error) {
        if (error instanceof MissingPathConfigError) {
            return Response.json({ error: error.message, key: error.key }, { status: 400 });
        }

        return Response.json({ error: 'Failed to build translation payload.' }, { status: 500 });
    }
};

export const Route = createFileRoute('/api/compilation/excerpts/payload')({
    server: { handlers: { GET: ({ request }) => GET(request) } },
});

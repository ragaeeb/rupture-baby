import { estimateTokenCount, type LLMProvider } from 'bitaboom';
import { NextResponse } from 'next/server';

import { MissingPathConfigError } from '@/lib/data-paths';

import type { Excerpt } from '@/lib/compilation';
import { groupIdsByTokenLimits } from '@/lib/grouping';
import { getSelectedPrompt } from '@/lib/prompt-state';
import { DEFAULT_MODEL_ID, getTranslationModelById } from '@/lib/translation-models';
import { getCachedUntranslatedExcerpts, getCachedUntranslatedPickerItems } from '@/lib/untranslated-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 5;
const MAX_PAGE_SIZE = 100;
const DEFAULT_MAX_IDS = 500;
const MAX_MAX_IDS = 2000;

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

const parseOptionalNonNegativeInt = (value: string | null): number | null => {
    if (!value) {
        return null;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return null;
    }

    return parsed;
};

const estimateBatchTokens = (
    ids: string[],
    extractText: (id: string) => string | undefined,
    basePromptTokens: number,
    provider: LLMProvider,
): number => {
    let tokens = basePromptTokens;

    for (const id of ids) {
        const text = extractText(id) ?? '';
        const overheadChars = id.length + 5;
        tokens += estimateTokenCount(text, provider) + Math.ceil(overheadChars / 4);
    }

    return tokens;
};

export const GET = async (request: Request) => {
    try {
        const { searchParams } = new URL(request.url);
        const page = parsePositiveInt(searchParams.get('page'), DEFAULT_PAGE);
        const requestedPageSize = parsePositiveInt(searchParams.get('pageSize'), DEFAULT_PAGE_SIZE);
        const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);
        const maxIds = Math.min(parsePositiveInt(searchParams.get('maxIds'), DEFAULT_MAX_IDS), MAX_MAX_IDS);
        const modelId = searchParams.get('modelId') ?? DEFAULT_MODEL_ID;
        const selectedEndIndexParam = parseOptionalNonNegativeInt(searchParams.get('selectedEndIndex'));
        const selectedPrompt = getSelectedPrompt();
        const selectedModel = getTranslationModelById(modelId);

        if (!selectedModel) {
            return NextResponse.json({ error: `Invalid modelId "${modelId}".` }, { status: 400 });
        }

        const untranslatedExcerpts = await getCachedUntranslatedExcerpts();
        const untranslatedPickerItems = await getCachedUntranslatedPickerItems();

        const totalItems = untranslatedExcerpts.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
        const safePage = Math.min(page, totalPages);
        const startIndex = (safePage - 1) * pageSize;
        const endIndex = startIndex + pageSize;

        const data = untranslatedExcerpts.slice(startIndex, endIndex);
        const availableIds = untranslatedPickerItems.map((item) => item.id);
        const displayedIds = availableIds.slice(0, maxIds);

        const itemById = new Map(untranslatedPickerItems.map((item) => [item.id, item]));
        const basePromptTokens = estimateTokenCount(selectedPrompt.content, selectedModel.provider);
        const tokenGroups = groupIdsByTokenLimits(
            displayedIds,
            (id) => itemById.get(id)?.nass,
            basePromptTokens,
            selectedModel.provider,
        );

        const selectedEndIndex =
            selectedEndIndexParam === null ? null : Math.min(selectedEndIndexParam, displayedIds.length - 1);
        const selectedIds = selectedEndIndex === null ? [] : displayedIds.slice(0, selectedEndIndex + 1);
        const selectedItems = selectedIds
            .map((id) => itemById.get(id))
            .filter((item): item is Excerpt => Boolean(item));
        const selectedTokenCount = estimateBatchTokens(
            selectedIds,
            (id) => itemById.get(id)?.nass,
            basePromptTokens,
            selectedModel.provider,
        );

        return NextResponse.json({
            data,
            pagination: {
                hasNextPage: safePage < totalPages,
                hasPreviousPage: safePage > 1,
                page: safePage,
                pageSize,
                totalItems,
                totalPages,
            },
            picker: {
                availableTotal: availableIds.length,
                displayedIds,
                displayedTotal: displayedIds.length,
                maxIds,
                model: selectedModel,
                promptId: selectedPrompt.id,
                promptTokens: basePromptTokens,
                selectedCount: selectedIds.length,
                selectedEndIndex,
                selectedIds,
                selectedItems,
                selectedTokenCount,
                tokenGroups,
            },
        });
    } catch (error) {
        if (error instanceof MissingPathConfigError) {
            return NextResponse.json({ error: error.message, key: error.key }, { status: 400 });
        }
        return NextResponse.json({ error: 'Failed to load compilation excerpts.' }, { status: 500 });
    }
};

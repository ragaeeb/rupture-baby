import type { Excerpt } from '@/lib/compilation';

export type TranslationApiResponse = {
    data: Excerpt[];
    pagination: {
        page: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
        hasNextPage: boolean;
        hasPreviousPage: boolean;
    };
    picker: {
        model: { id: string; label: string; provider: string };
        promptId: string;
        promptTokens: number;
        availableTotal: number;
        displayedTotal: number;
        maxIds: number;
        selectedEndIndex: number | null;
        selectedCount: number;
        selectedTokenCount: number;
        displayedIds: string[];
        tokenGroups: Array<{ label: string; limit: number; ids: string[]; lastIndex: number }>;
        selectedIds: string[];
        selectedItems: Excerpt[];
    };
};

export type PromptOption = {
    id: string;
    name: string;
};

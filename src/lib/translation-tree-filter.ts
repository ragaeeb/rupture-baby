import { getThinkingTimeRange, type ThinkingTimeRange } from '@/lib/reasoning-time';
import type { TranslationStats, TranslationTreeNode } from '@/lib/shell-types';

export type TranslationTreeFilter = {
    model: string | 'all';
    status: 'all' | 'valid' | 'invalid';
    thinkingTime: 'all' | Exclude<ThinkingTimeRange, 'all'>;
};

const hasActiveTreeFilters = (filter: TranslationTreeFilter) =>
    filter.model !== 'all' || filter.status !== 'all' || filter.thinkingTime !== 'all';

const createPathFilterSets = (filter: TranslationTreeFilter) => ({
    modelPaths: filter.model !== 'all' ? new Set<string>() : null,
    statusPaths: filter.status !== 'all' ? new Set<string>() : null,
    thinkingTimePaths: filter.thinkingTime !== 'all' ? new Set<string>() : null,
});

const populatePathFilterSets = (
    translationStats: TranslationStats,
    filter: TranslationTreeFilter,
    filterSets: ReturnType<typeof createPathFilterSets>,
) => {
    for (const file of translationStats.files) {
        if (filterSets.modelPaths && file.model === filter.model) {
            filterSets.modelPaths.add(file.path);
        }

        if (filterSets.statusPaths && (filter.status === 'valid' ? file.isValid : !file.isValid)) {
            filterSets.statusPaths.add(file.path);
        }

        if (filterSets.thinkingTimePaths && getThinkingTimeRange(file.reasoningDurationSec) === filter.thinkingTime) {
            filterSets.thinkingTimePaths.add(file.path);
        }
    }
};

const filterTreeNode = (
    node: TranslationTreeNode,
    modelPaths: Set<string> | null,
    statusPaths: Set<string> | null,
    thinkingTimePaths: Set<string> | null,
): TranslationTreeNode | null => {
    if (node.kind === 'file') {
        if (modelPaths && !modelPaths.has(node.relativePath)) {
            return null;
        }
        if (statusPaths && !statusPaths.has(node.relativePath)) {
            return null;
        }
        if (thinkingTimePaths && !thinkingTimePaths.has(node.relativePath)) {
            return null;
        }
        return node;
    }

    if (!node.children) {
        return null;
    }

    const filteredChildren = node.children
        .map((child) => filterTreeNode(child, modelPaths, statusPaths, thinkingTimePaths))
        .filter((child): child is TranslationTreeNode => child !== null);

    if (filteredChildren.length === 0) {
        return null;
    }

    return { ...node, children: filteredChildren };
};

export const filterTranslationTreeEntries = (
    entries: TranslationTreeNode[],
    translationStats: TranslationStats | null | undefined,
    filter: TranslationTreeFilter,
): TranslationTreeNode[] => {
    const hasActiveFilters = hasActiveTreeFilters(filter);

    if (!translationStats) {
        return hasActiveFilters ? [] : entries;
    }

    if (!hasActiveFilters) {
        return entries;
    }

    const filterSets = createPathFilterSets(filter);
    populatePathFilterSets(translationStats, filter, filterSets);

    return entries
        .map((node) =>
            filterTreeNode(node, filterSets.modelPaths, filterSets.statusPaths, filterSets.thinkingTimePaths),
        )
        .filter((node): node is TranslationTreeNode => node !== null);
};

import { getThinkingTimeRange, type ThinkingTimeRange } from '@/lib/reasoning-time';
import type { TranslationStats, TranslationTreeNode } from '@/lib/shell-types';

export type TranslationTreeFilter = {
    model: string | 'all';
    status: 'all' | 'valid' | 'invalid';
    thinkingTime: 'all' | Exclude<ThinkingTimeRange, 'all'>;
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
    const hasActiveFilters = filter.model !== 'all' || filter.status !== 'all' || filter.thinkingTime !== 'all';

    if (!translationStats) {
        return hasActiveFilters ? [] : entries;
    }

    if (!hasActiveFilters) {
        return entries;
    }

    const modelPaths =
        filter.model !== 'all'
            ? new Set(translationStats.files.filter((file) => file.model === filter.model).map((file) => file.path))
            : null;

    const statusPaths =
        filter.status !== 'all'
            ? new Set(
                  translationStats.files
                      .filter((file) => (filter.status === 'valid' ? file.isValid : !file.isValid))
                      .map((file) => file.path),
              )
            : null;

    const thinkingTimePaths =
        filter.thinkingTime !== 'all'
            ? new Set(
                  translationStats.files
                      .filter((file) => getThinkingTimeRange(file.reasoningDurationSec) === filter.thinkingTime)
                      .map((file) => file.path),
              )
            : null;

    return entries
        .map((node) => filterTreeNode(node, modelPaths, statusPaths, thinkingTimePaths))
        .filter((node): node is TranslationTreeNode => node !== null);
};

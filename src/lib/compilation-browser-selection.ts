import type { CompilationBrowseRow } from '@/lib/shell-types';

export const formatCompilationRowsWithPrompt = (prompt: string, rows: CompilationBrowseRow[]) => {
    const trimmedPrompt = prompt.trim();
    const selectedLines = rows.map((row) => `${row.id} - ${row.nass}`);

    if (trimmedPrompt.length === 0) {
        return selectedLines.join('\n');
    }

    if (selectedLines.length === 0) {
        return trimmedPrompt;
    }

    return `${trimmedPrompt}\n\n${selectedLines.join('\n')}`;
};

const getRangeRowIds = (orderedRowIds: string[], startRowId: string, endRowId: string) => {
    const startIndex = orderedRowIds.indexOf(startRowId);
    const endIndex = orderedRowIds.indexOf(endRowId);

    if (startIndex === -1 || endIndex === -1) {
        return null;
    }

    const [rangeStart, rangeEnd] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
    return orderedRowIds.slice(rangeStart, rangeEnd + 1);
};

const getOrderedSelection = (orderedRowIds: string[], selectedRowIds: Set<string>) =>
    orderedRowIds.filter((rowId) => selectedRowIds.has(rowId));

export const getNextCompilationSelectedRowIds = ({
    checked,
    currentRowIds,
    lastClickedRowId,
    orderedRowIds,
    rowId,
    shiftKey,
}: {
    checked: boolean;
    currentRowIds: string[];
    lastClickedRowId: string | null;
    orderedRowIds: string[];
    rowId: string;
    shiftKey: boolean;
}) => {
    if (shiftKey && lastClickedRowId) {
        const rangeRowIds = getRangeRowIds(orderedRowIds, lastClickedRowId, rowId);
        if (rangeRowIds) {
            const nextSelectedRowIds = new Set(currentRowIds);

            for (const rangeRowId of rangeRowIds) {
                if (checked) {
                    nextSelectedRowIds.add(rangeRowId);
                } else {
                    nextSelectedRowIds.delete(rangeRowId);
                }
            }

            return getOrderedSelection(orderedRowIds, nextSelectedRowIds);
        }
    }

    if (!checked) {
        return currentRowIds.filter((currentRowId) => currentRowId !== rowId);
    }

    return currentRowIds.includes(rowId) ? currentRowIds : [...currentRowIds, rowId];
};

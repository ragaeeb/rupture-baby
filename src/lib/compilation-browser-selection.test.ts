import { describe, expect, it } from 'bun:test';

import type { CompilationBrowseRow } from '@/lib/shell-types';

import { formatCompilationRowsWithPrompt, getNextCompilationSelectedRowIds } from './compilation-browser-selection';

const rows: CompilationBrowseRow[] = [
    {
        collection: 'excerpts',
        from: 0,
        id: 'P1',
        index: 0,
        isTranslated: false,
        lastUpdatedAt: null,
        nass: 'أول',
        num: null,
        parent: null,
        text: null,
        to: null,
        translator: null,
    },
    {
        collection: 'excerpts',
        from: 1,
        id: 'P2',
        index: 1,
        isTranslated: false,
        lastUpdatedAt: null,
        nass: 'ثان',
        num: null,
        parent: null,
        text: null,
        to: null,
        translator: null,
    },
    {
        collection: 'excerpts',
        from: 2,
        id: 'P3',
        index: 2,
        isTranslated: false,
        lastUpdatedAt: null,
        nass: 'ثالث',
        num: null,
        parent: null,
        text: null,
        to: null,
        translator: null,
    },
];

describe('formatCompilationRowsWithPrompt', () => {
    it('should format selected rows like the payload endpoint without token limits', () => {
        expect(formatCompilationRowsWithPrompt('Translate this', rows.slice(0, 2))).toBe(
            'Translate this\n\nP1 - أول\nP2 - ثان',
        );
    });

    it('should return only lines when the prompt is blank', () => {
        expect(formatCompilationRowsWithPrompt('   ', rows.slice(0, 2))).toBe('P1 - أول\nP2 - ثان');
    });
});

describe('getNextCompilationSelectedRowIds', () => {
    it('should select a contiguous range when shift-clicking', () => {
        expect(
            getNextCompilationSelectedRowIds({
                checked: true,
                currentRowIds: ['P1'],
                lastClickedRowId: 'P1',
                orderedRowIds: rows.map((row) => row.id),
                rowId: 'P3',
                shiftKey: true,
            }),
        ).toEqual(['P1', 'P2', 'P3']);
    });

    it('should remove a contiguous range when shift-unchecking', () => {
        expect(
            getNextCompilationSelectedRowIds({
                checked: false,
                currentRowIds: ['P1', 'P2', 'P3'],
                lastClickedRowId: 'P1',
                orderedRowIds: rows.map((row) => row.id),
                rowId: 'P2',
                shiftKey: true,
            }),
        ).toEqual(['P3']);
    });
});

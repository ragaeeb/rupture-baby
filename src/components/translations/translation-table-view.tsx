'use client';

import { Wrench } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { ClickToEditText } from '@/components/translations/click-to-edit-text';
import type { TranslationRowData, TranslationTableModel } from '@/lib/translation-file-view-model';
import type { Range } from '@/lib/validation/types';

type HighlightTone = 'amber' | 'destructive';

type TextHighlight = { range: Range; tone: HighlightTone };

const renderHighlightedText = (text: string, highlights: TextHighlight[]): ReactNode => {
    const activeHighlights = highlights.filter((highlight) => highlight.range.start < highlight.range.end);

    if (activeHighlights.length === 0) {
        return text;
    }

    const boundaries = new Set<number>([0, text.length]);
    for (const highlight of activeHighlights) {
        boundaries.add(highlight.range.start);
        boundaries.add(highlight.range.end);
    }

    const orderedBoundaries = [...boundaries].sort((left, right) => left - right);
    const nodes: ReactNode[] = [];

    for (let index = 0; index < orderedBoundaries.length - 1; index += 1) {
        const start = orderedBoundaries[index];
        const end = orderedBoundaries[index + 1];

        if (start === undefined || end === undefined || start === end) {
            continue;
        }

        const slice = text.slice(start, end);
        const activeTone = activeHighlights.find(
            (highlight) => highlight.range.start <= start && highlight.range.end >= end,
        )?.tone;

        if (!activeTone) {
            nodes.push(slice);
            continue;
        }

        const className =
            activeTone === 'destructive'
                ? 'rounded-sm bg-destructive/15 px-0.5 font-semibold text-destructive ring-1 ring-destructive/30 ring-inset'
                : 'rounded-sm bg-amber-200/60 px-0.5 font-semibold text-amber-950 ring-1 ring-amber-400/40 ring-inset';

        nodes.push(
            <span key={`${start}-${end}-${slice}`} className={className}>
                {slice}
            </span>,
        );
    }

    return nodes;
};

const getRowClassName = (row: TranslationRowData) => {
    if (row.validationMessages.length > 0) {
        return 'border-b bg-destructive/5 shadow-[inset_0_0_0_1px_hsl(var(--destructive)/0.35)] last:border-b-0';
    }
    if (row.isDirty) {
        return 'border-b bg-amber-50 shadow-[inset_0_0_0_1px_hsl(var(--amber-400)/0.45)] last:border-b-0';
    }
    if (row.hasPatch) {
        return 'border-b bg-amber-50/70 shadow-[inset_0_0_0_1px_hsl(var(--amber-400)/0.25)] last:border-b-0';
    }
    return 'border-b last:border-b-0';
};

const getRowIdClassName = (row: TranslationRowData) => {
    if (row.validationMessages.length > 0) {
        return 'px-4 py-3 align-top font-mono font-semibold text-[10px] text-destructive';
    }
    if (row.isDirty) {
        return 'px-4 py-3 align-top font-mono font-semibold text-[10px] text-amber-900';
    }
    if (row.hasPatch) {
        return 'px-4 py-3 align-top font-mono font-semibold text-[10px] text-amber-800';
    }
    return 'px-4 py-3 align-top font-mono text-[10px] text-muted-foreground';
};

const getTranslationControlClassName = (row: TranslationRowData, mode: 'button' | 'textarea') => {
    if (row.isDirty) {
        return mode === 'button'
            ? 'block w-full rounded border border-amber-400/50 bg-amber-50 px-3 py-2 text-left font-medium text-amber-900 shadow-sm transition-colors hover:bg-amber-100/60'
            : 'block w-full resize-none overflow-hidden rounded border border-amber-400/50 bg-amber-50 px-3 py-2 font-medium text-[10px] text-amber-900 leading-normal shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40';
    }

    if (row.hasPatch) {
        return mode === 'button'
            ? 'block w-full rounded border border-amber-400/40 bg-amber-50/60 px-3 py-2 text-left font-medium text-amber-950 shadow-sm transition-colors hover:bg-amber-100/40'
            : 'block w-full resize-none overflow-hidden rounded border border-amber-400/40 bg-amber-50/60 px-3 py-2 font-medium text-[10px] text-amber-950 leading-normal shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40';
    }

    return mode === 'button'
        ? 'block w-full rounded border border-destructive/30 bg-background px-3 py-2 text-left font-medium text-destructive shadow-sm transition-colors hover:bg-destructive/5'
        : 'block w-full resize-none overflow-hidden rounded border border-destructive/30 bg-background px-3 py-2 font-medium text-[10px] text-destructive leading-normal shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-destructive/40';
};

const getValidationMessagesClassName = (row: TranslationRowData) => {
    if (row.isDirty) {
        return 'mt-2 space-y-1 rounded border border-amber-400/30 bg-amber-50 px-3 py-2';
    }
    return 'mt-2 space-y-1 rounded border border-destructive/20 bg-destructive/5 px-3 py-2';
};

const getValidationMessageTextClassName = (row: TranslationRowData) =>
    row.isDirty ? 'font-medium text-amber-900 text-xs' : 'font-medium text-destructive text-xs';

const getTranslationTextClassName = (row: TranslationRowData) =>
    row.hasPatch ? 'whitespace-pre-wrap pr-6' : 'whitespace-pre-wrap';

const TranslationRow = ({
    isEditing,
    onDraftChange,
    onStartEditing,
    onStopEditing,
    row,
}: {
    isEditing: boolean;
    onDraftChange: (id: string, originalText: string, nextText: string) => void;
    onStartEditing: (id: string) => void;
    onStopEditing: () => void;
    row: TranslationRowData;
}) => {
    const isEditable = row.validationMessages.length > 0 || row.isDirty;
    const displayValue = row.translatedText
        ? renderHighlightedText(row.translatedText, [
              ...row.highlightRanges.map((range) => ({ range, tone: 'destructive' as const })),
              ...row.patchHighlightRanges.map((range) => ({ range, tone: 'amber' as const })),
          ])
        : '—';

    return (
        <tr className={getRowClassName(row)}>
            <td className={getRowIdClassName(row)}>{row.id}</td>
            <td className="whitespace-pre-wrap px-4 py-3 align-top text-sm" dir="rtl">
                {row.arabic}
            </td>
            <td className="relative px-4 py-3 align-top text-[10px]">
                <ClickToEditText
                    ariaLabel={`Edit translation for ${row.id}`}
                    buttonClassName={getTranslationControlClassName(row, 'button')}
                    displayValue={displayValue}
                    editable={isEditable}
                    isEditing={isEditing}
                    onCommit={(nextText) => {
                        if (nextText !== row.translatedText) {
                            onDraftChange(row.id, row.baseTranslatedText, nextText);
                        }
                    }}
                    onStartEditing={() => onStartEditing(row.id)}
                    onStopEditing={onStopEditing}
                    textClassName={getTranslationTextClassName(row)}
                    textareaClassName={`${getTranslationControlClassName(row, 'textarea')} ${row.hasPatch ? 'pr-8' : ''}`}
                    value={row.translatedText}
                />
                {row.validationMessages.length > 0 ? (
                    <div className={getValidationMessagesClassName(row)}>
                        {row.validationMessages.map((message) => (
                            <p key={`${row.id}-${message}`} className={getValidationMessageTextClassName(row)}>
                                {message}
                            </p>
                        ))}
                    </div>
                ) : null}
            </td>
        </tr>
    );
};

type TranslationTableViewProps = {
    arabicLeakFixError: string | null;
    isFixingArabicLeaks: boolean;
    model: TranslationTableModel | null;
    onAutoFixArabicLeaks: () => void;
    onDraftChange: (id: string, originalText: string, nextText: string) => void;
};

export const TranslationTableView = ({
    arabicLeakFixError,
    isFixingArabicLeaks,
    model,
    onAutoFixArabicLeaks,
    onDraftChange,
}: TranslationTableViewProps) => {
    const [editingRowId, setEditingRowId] = useState<string | null>(null);

    if (!model) {
        return (
            <div className="flex h-full min-h-0 flex-col items-center justify-center">
                <p className="text-muted-foreground text-sm">Failed to parse conversation.</p>
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col gap-4">
            {model.hasPatches ? (
                <div className="rounded-md border border-amber-400/30 bg-amber-50 p-4 text-sm">
                    <p className="font-medium text-amber-950">Patched excerpts are applied in this file.</p>
                    <p className="mt-1 text-muted-foreground">Patched rows: {model.patchedRowCount}</p>
                </div>
            ) : null}

            {!model.isValid ? (
                <div className="rounded-md border border-destructive/20 bg-destructive/5 p-4 text-sm">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            {model.hasAlignmentErrors ? (
                                <>
                                    <p className="font-medium text-destructive">
                                        The translated response does not match the source excerpts.
                                    </p>
                                    <p className="mt-1 text-muted-foreground">
                                        Source IDs: {model.sourceIds.join(', ') || 'None'}
                                    </p>
                                    <p className="mt-1 text-muted-foreground">
                                        Response IDs: {model.responseIds.join(', ') || 'None'}
                                    </p>
                                </>
                            ) : (
                                <p className="font-medium text-destructive">Errors found.</p>
                            )}
                            {arabicLeakFixError ? (
                                <p className="mt-2 text-destructive text-xs">{arabicLeakFixError}</p>
                            ) : null}
                        </div>
                        {model.arabicLeakExcerpts.length > 0 ? (
                            <button
                                className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-amber-400/40 bg-amber-50 px-3 font-medium text-amber-950 text-xs shadow-sm transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={isFixingArabicLeaks}
                                onClick={onAutoFixArabicLeaks}
                                type="button"
                            >
                                <Wrench className="mr-2 size-3.5" />
                                {isFixingArabicLeaks ? 'Fixing Arabic leaks...' : 'Fix Arabic leaks'}
                            </button>
                        ) : null}
                    </div>
                </div>
            ) : null}

            <div className="flex-1 overflow-auto rounded-md border">
                <table className="w-full">
                    <thead className="sticky top-0 bg-background">
                        <tr className="border-b">
                            <th className="w-16 px-4 py-2 text-left font-medium text-xs">ID</th>
                            <th className="w-1/2 px-4 py-2 text-left font-medium">Arabic</th>
                            <th className="w-1/2 px-4 py-2 text-left font-medium text-xs">Translation</th>
                        </tr>
                    </thead>
                    <tbody>
                        {model.rows.map((row) => (
                            <TranslationRow
                                key={row.id}
                                isEditing={editingRowId === row.id}
                                onDraftChange={onDraftChange}
                                onStartEditing={setEditingRowId}
                                onStopEditing={() => setEditingRowId(null)}
                                row={row}
                            />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

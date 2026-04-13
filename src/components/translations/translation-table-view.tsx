'use client';

import { Ban, Wrench } from 'lucide-react';
import { useState } from 'react';

import { EditableTranslationContent } from '@/components/translations/editable-translation-content';
import type { TranslationRowData, TranslationTableModel } from '@/lib/translation-file-view-model';

const getRowClassName = (row: TranslationRowData) => {
    if (row.validationMessages.length > 0) {
        return 'border-b bg-destructive/5 shadow-[inset_0_0_0_1px_hsl(var(--destructive)/0.35)] last:border-b-0';
    }
    if (row.isSkipped) {
        return 'border-b bg-muted/30 opacity-75 last:border-b-0';
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
    if (row.isSkipped) {
        return 'px-4 py-3 align-top font-mono font-semibold text-[10px] text-muted-foreground';
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
    if (row.validationMessages.length > 0) {
        return mode === 'button'
            ? 'block w-full rounded border border-destructive/30 bg-background px-3 py-2 text-left font-medium text-destructive shadow-sm transition-colors hover:bg-destructive/5'
            : 'block w-full resize-none overflow-hidden rounded border border-destructive/30 bg-background px-3 py-2 font-medium text-[10px] text-destructive leading-normal shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-destructive/40';
    }

    if (row.isSkipped) {
        return mode === 'button'
            ? 'block w-full rounded border border-muted bg-muted/20 px-3 py-2 text-left text-muted-foreground shadow-sm transition-colors hover:bg-muted/30'
            : 'block w-full resize-none overflow-hidden rounded border border-muted bg-muted/10 px-3 py-2 text-[10px] text-muted-foreground leading-normal shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30';
    }

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

    if (row.isMissingTranslation) {
        return mode === 'button'
            ? 'block w-full rounded border border-dashed border-destructive/30 bg-destructive/5 px-3 py-2 text-left font-medium text-destructive shadow-sm transition-colors hover:bg-destructive/10'
            : 'block w-full resize-none overflow-hidden rounded border border-dashed border-destructive/30 bg-background px-3 py-2 font-medium text-[10px] text-foreground leading-normal shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-destructive/30';
    }

    return mode === 'button'
        ? 'block w-full rounded border border-input bg-background px-3 py-2 text-left shadow-sm transition-colors hover:bg-muted/40'
        : 'block w-full resize-none overflow-hidden rounded border border-input bg-background px-3 py-2 text-[10px] leading-normal shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40';
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
    isSelected,
    onDraftChange,
    onStartEditing,
    onStopEditing,
    onToggleSelect,
    onToggleSkip,
    skipActionDisabled,
    row,
}: {
    isEditing: boolean;
    isSelected: boolean;
    onDraftChange: (id: string, originalText: string, nextText: string) => void;
    onStartEditing: (id: string) => void;
    onStopEditing: () => void;
    onToggleSelect: (id: string, checked: boolean) => void;
    onToggleSkip: (id: string, skipped: boolean) => void;
    skipActionDisabled: boolean;
    row: TranslationRowData;
}) => {
    return (
        <tr className={getRowClassName(row)}>
            <td className="px-2 py-3 align-top">
                <input
                    aria-label={`Select ${row.id}`}
                    checked={isSelected}
                    className="size-3.5 accent-primary"
                    onChange={(event) => onToggleSelect(row.id, event.target.checked)}
                    type="checkbox"
                />
            </td>
            <td className={getRowIdClassName(row)}>
                <div className="flex flex-col items-start gap-2">
                    <span>{row.id}</span>
                    <button
                        aria-label={row.isSkipped ? `Unskip ${row.id}` : `Skip ${row.id}`}
                        className="inline-flex size-6 items-center justify-center rounded border border-input bg-background text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
                        disabled={skipActionDisabled}
                        onClick={() => onToggleSkip(row.id, !row.isSkipped)}
                        type="button"
                    >
                        <Ban className="size-3" />
                    </button>
                </div>
            </td>
            <td className="whitespace-pre-wrap px-4 py-3 align-top text-sm" dir="rtl">
                {row.arabic}
            </td>
            <td className="relative px-4 py-3 align-top text-[10px]">
                <EditableTranslationContent
                    ariaLabel={`Edit translation for ${row.id}`}
                    buttonClassName={getTranslationControlClassName(row, 'button')}
                    editable
                    emptyDisplayValue={row.isMissingTranslation ? '[MISSING TRANSLATION]' : undefined}
                    isEditing={isEditing}
                    onCommit={(nextText) => {
                        if (nextText !== row.translatedText) {
                            onDraftChange(row.id, row.baseTranslatedText, nextText);
                        }
                    }}
                    onStartEditing={() => onStartEditing(row.id)}
                    onStopEditing={onStopEditing}
                    patchHighlights={row.patchHighlights}
                    text={row.translatedText}
                    textClassName={getTranslationTextClassName(row)}
                    textareaClassName={`${getTranslationControlClassName(row, 'textarea')} ${row.hasPatch ? 'pr-8' : ''}`}
                    validationHighlightRanges={row.highlightRanges}
                />
                {row.isSkipped ? (
                    <div className="mt-2 rounded border border-muted bg-muted/20 px-3 py-2">
                        <p className="font-medium text-[10px] text-muted-foreground">
                            This excerpt is skipped. It will be omitted from playback and validation.
                        </p>
                    </div>
                ) : null}
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
    isUpdatingSkip: boolean;
    model: TranslationTableModel | null;
    onAutoFixArabicLeaks: () => void;
    onBulkSetSkip: (skipped: boolean) => void;
    onDraftChange: (id: string, originalText: string, nextText: string) => void;
    onToggleSelectAll: (checked: boolean) => void;
    onToggleSelectRow: (id: string, checked: boolean) => void;
    onToggleSkip: (id: string, skipped: boolean) => void;
    selectedRowIds: string[];
    skippingRowId: string | null;
};

export const TranslationTableView = ({
    arabicLeakFixError,
    isFixingArabicLeaks,
    isUpdatingSkip,
    model,
    onAutoFixArabicLeaks,
    onBulkSetSkip,
    onDraftChange,
    onToggleSelectAll,
    onToggleSelectRow,
    onToggleSkip,
    selectedRowIds,
    skippingRowId,
}: TranslationTableViewProps) => {
    const [editingRowId, setEditingRowId] = useState<string | null>(null);

    if (!model) {
        return (
            <div className="flex h-full min-h-0 flex-col items-center justify-center">
                <p className="text-muted-foreground text-sm">Failed to parse conversation.</p>
            </div>
        );
    }

    const allRowsSelected = model.rows.length > 0 && selectedRowIds.length === model.rows.length;
    const someRowsSelected = selectedRowIds.length > 0 && selectedRowIds.length < model.rows.length;
    const selectedRows = model.rows.filter((row) => selectedRowIds.includes(row.id));
    const canSkipSelected = selectedRows.some((row) => !row.isSkipped);
    const canUnskipSelected = selectedRows.some((row) => row.isSkipped);

    return (
        <div className="flex h-full min-h-0 flex-col gap-4">
            {selectedRowIds.length > 0 ? (
                <div className="flex items-center justify-between rounded-md border bg-muted/20 px-4 py-3 text-sm">
                    <p className="text-muted-foreground">{selectedRowIds.length} rows selected.</p>
                    <div className="flex items-center gap-2">
                        <button
                            className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 font-medium text-xs transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={!canSkipSelected || isUpdatingSkip}
                            onClick={() => onBulkSetSkip(true)}
                            type="button"
                        >
                            Skip selected
                        </button>
                        <button
                            className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 font-medium text-xs transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={!canUnskipSelected || isUpdatingSkip}
                            onClick={() => onBulkSetSkip(false)}
                            type="button"
                        >
                            Unskip selected
                        </button>
                    </div>
                </div>
            ) : null}

            {model.hasPatches ? (
                <div className="rounded-md border border-amber-400/30 bg-amber-50 p-4 text-sm">
                    <p className="font-medium text-amber-950">Patched excerpts are applied in this file.</p>
                    <p className="mt-1 text-muted-foreground">Patched rows: {model.patchedRowCount}</p>
                </div>
            ) : null}

            {model.isSourceAlignedToResponse ? (
                <div className="rounded-md border border-amber-400/30 bg-amber-50 p-4 text-sm">
                    <p className="font-medium text-amber-950">The source block was aligned to the final response block.</p>
                    <p className="mt-1 text-muted-foreground">
                        This usually means the prompt included example excerpts before the real translation section.
                    </p>
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
                        {model.arabicLeakExcerpts.length > 0 || model.allCapsExcerpts.length > 0 ? (
                            <button
                                className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-amber-400/40 bg-amber-50 px-3 font-medium text-amber-950 text-xs shadow-sm transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={isFixingArabicLeaks}
                                onClick={onAutoFixArabicLeaks}
                                type="button"
                            >
                                <Wrench className="mr-2 size-3.5" />
                                {isFixingArabicLeaks ? 'Fixing supported errors...' : 'Fix supported errors'}
                            </button>
                        ) : null}
                    </div>
                </div>
            ) : null}

            <div className="flex-1 overflow-auto rounded-md border">
                <table className="w-full">
                    <thead className="sticky top-0 bg-background">
                        <tr className="border-b">
                            <th className="w-10 px-2 py-2 text-left">
                                <input
                                    aria-checked={someRowsSelected ? 'mixed' : allRowsSelected}
                                    aria-label="Select all rows"
                                    checked={allRowsSelected}
                                    className="size-3.5 accent-primary"
                                    ref={(node) => {
                                        if (node) {
                                            node.indeterminate = someRowsSelected;
                                        }
                                    }}
                                    onChange={(event) => onToggleSelectAll(event.target.checked)}
                                    type="checkbox"
                                />
                            </th>
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
                                isSelected={selectedRowIds.includes(row.id)}
                                onDraftChange={onDraftChange}
                                onStartEditing={setEditingRowId}
                                onStopEditing={() => setEditingRowId(null)}
                                onToggleSelect={onToggleSelectRow}
                                onToggleSkip={onToggleSkip}
                                skipActionDisabled={Boolean(skippingRowId) || isUpdatingSkip}
                                row={row}
                            />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

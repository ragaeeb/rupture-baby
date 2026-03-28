'use client';

import { Link, useRouter } from '@tanstack/react-router';
import { Wrench } from 'lucide-react';
import { startTransition, useMemo, useState } from 'react';

import { EditableTranslationContent } from '@/components/translations/editable-translation-content';
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { getStoredAssistProvider } from '@/lib/assist-provider-storage';
import {
    applyArabicLeakCorrectionsToInvalidRows,
    commitInvalidPendingEdits,
    getInvalidPendingEditKey,
    type InvalidPendingEditMap,
    updateInvalidPendingEdits,
} from '@/lib/invalid-excerpts-fixes';
import { commitTranslationPatch, requestArabicLeakCorrections } from '@/lib/server-functions';
import type { InvalidExcerptsResponse } from '@/lib/shell-types';
import { getCommitButtonLabel } from '@/lib/translation-file-view-model';
import { getRuptureDisplayHighlights } from '@/lib/translation-patches';
import { VALIDATION_ERROR_TYPE_INFO } from '@/lib/validation/utils';

type InvalidExcerptsPageProps = { data: InvalidExcerptsResponse };

const ERROR_TYPE_LABELS: Record<string, string> = {
    file_error: 'File Error',
    ...Object.fromEntries(
        Object.entries(VALIDATION_ERROR_TYPE_INFO).map(([type, info]) => [
            type,
            info.description
                .split('.')
                .at(0)
                ?.replace(/^The response contains /, '')
                .replace(/^Arabic script was /, 'Arabic leak') ?? type,
        ]),
    ),
};

const getErrorTypeLabel = (errorType: string) =>
    ERROR_TYPE_LABELS[errorType] ??
    errorType
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');

const MAX_FIX_SELECTION_SIZE = 10;

const getRowKey = (row: InvalidExcerptsResponse['rows'][number]) => `${row.filePath}::${row.id ?? 'global'}`;

const isFixableArabicLeakRow = (row: InvalidExcerptsResponse['rows'][number]) =>
    Boolean(row.id && row.arabic && row.translation && row.errorTypes.includes('arabic_leak'));

const isEditableTranslationRow = (
    row: InvalidExcerptsResponse['rows'][number],
): row is InvalidExcerptsResponse['rows'][number] & { baseTranslation: string; id: string; translation: string } =>
    Boolean(row.id && row.translation && row.baseTranslation);

const getRangeSelectionKeys = (orderedFixableRowKeys: string[], startRowKey: string, endRowKey: string) => {
    const startIndex = orderedFixableRowKeys.indexOf(startRowKey);
    const endIndex = orderedFixableRowKeys.indexOf(endRowKey);

    if (startIndex === -1 || endIndex === -1) {
        return null;
    }

    const [rangeStart, rangeEnd] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
    return orderedFixableRowKeys.slice(rangeStart, rangeEnd + 1);
};

const applyCheckedSelectionRange = (currentKeys: string[], orderedFixableRowKeys: string[], rangeKeys: string[]) => {
    const nextSelectedSet = new Set(currentKeys);
    for (const key of rangeKeys) {
        nextSelectedSet.add(key);
    }

    return orderedFixableRowKeys.filter((key) => nextSelectedSet.has(key)).slice(0, MAX_FIX_SELECTION_SIZE);
};

const getNextSelectedRowKeys = ({
    checked,
    currentKeys,
    lastClickedRowKey,
    orderedFixableRowKeys,
    rowKey,
    shiftKey,
}: {
    checked: boolean;
    currentKeys: string[];
    lastClickedRowKey: string | null;
    orderedFixableRowKeys: string[];
    rowKey: string;
    shiftKey: boolean;
}) => {
    if (shiftKey && lastClickedRowKey && orderedFixableRowKeys.includes(lastClickedRowKey)) {
        const rangeKeys = getRangeSelectionKeys(orderedFixableRowKeys, lastClickedRowKey, rowKey);
        if (rangeKeys) {
            if (checked) {
                return applyCheckedSelectionRange(currentKeys, orderedFixableRowKeys, rangeKeys);
            }
            return currentKeys.filter((key) => !rangeKeys.includes(key));
        }
    }

    if (!checked) {
        return currentKeys.filter((key) => key !== rowKey);
    }

    if (currentKeys.length >= MAX_FIX_SELECTION_SIZE) {
        return currentKeys;
    }

    return [...currentKeys, rowKey];
};

const InvalidExcerptsPage = ({ data }: InvalidExcerptsPageProps) => {
    const router = useRouter();
    const [selectedErrorType, setSelectedErrorType] = useState('all');
    const [assistError, setAssistError] = useState<string | null>(null);
    const [isFixingErrors, setIsFixingErrors] = useState(false);
    const [isCommitting, setIsCommitting] = useState(false);
    const [pendingEdits, setPendingEdits] = useState<InvalidPendingEditMap>({});
    const [resolvedRowKeys, setResolvedRowKeys] = useState<string[]>([]);
    const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
    const [editingRowKey, setEditingRowKey] = useState<string | null>(null);
    const [lastClickedRowKey, setLastClickedRowKey] = useState<string | null>(null);

    const resolvedRowKeySet = useMemo(() => new Set(resolvedRowKeys), [resolvedRowKeys]);

    const errorTypeOptions = useMemo(
        () => ['all', ...new Set(data.rows.flatMap((row) => row.errorTypes)).values()],
        [data.rows],
    );

    const rowsWithPendingTranslations = useMemo(
        () =>
            data.rows.map((row) => {
                if (!row.id) {
                    return row;
                }

                const pendingEdit = pendingEdits[getInvalidPendingEditKey(row.filePath, row.id)];
                if (!pendingEdit) {
                    return { ...row, patchHighlights: [] };
                }

                return {
                    ...row,
                    patchHighlights: getRuptureDisplayHighlights(
                        pendingEdit.nextTranslation,
                        pendingEdit.patch,
                        pendingEdit.metadata,
                    ),
                    translation: pendingEdit.nextTranslation,
                    validationHighlightRanges: [],
                };
            }),
        [data.rows, pendingEdits],
    );

    const filteredRows = useMemo(
        () =>
            selectedErrorType === 'all'
                ? rowsWithPendingTranslations
                : rowsWithPendingTranslations.filter((row) => row.errorTypes.includes(selectedErrorType)),
        [rowsWithPendingTranslations, selectedErrorType],
    );

    const visibleRows = useMemo(
        () => filteredRows.filter((row) => !resolvedRowKeySet.has(getRowKey(row))),
        [filteredRows, resolvedRowKeySet],
    );

    const fixableRows = useMemo(
        () =>
            visibleRows.filter(
                (row) => isFixableArabicLeakRow(row) && !pendingEdits[getInvalidPendingEditKey(row.filePath, row.id!)],
            ),
        [pendingEdits, visibleRows],
    );

    const orderedFixableRowKeys = useMemo(() => fixableRows.map((row) => getRowKey(row)), [fixableRows]);

    const selectedBatchRows = useMemo(
        () => fixableRows.filter((row) => selectedRowKeys.includes(getRowKey(row))).slice(0, MAX_FIX_SELECTION_SIZE),
        [fixableRows, selectedRowKeys],
    );

    const pendingEditCount = Object.keys(pendingEdits).length;

    const handleDraftChange = (
        row: InvalidExcerptsResponse['rows'][number] & { baseTranslation: string; id: string; translation: string },
        nextText: string,
    ) => {
        setPendingEdits((currentEdits) => updateInvalidPendingEdits(currentEdits, row, nextText));
    };

    const handleToggleRowSelection = (rowKey: string, checked: boolean, shiftKey: boolean) => {
        if (pendingEditCount > 0) {
            return;
        }

        setSelectedRowKeys((currentKeys) =>
            getNextSelectedRowKeys({
                checked,
                currentKeys,
                lastClickedRowKey,
                orderedFixableRowKeys,
                rowKey,
                shiftKey,
            }),
        );

        setLastClickedRowKey(rowKey);
    };

    const handleFixErrors = async () => {
        if (selectedBatchRows.length === 0 || isFixingErrors || pendingEditCount > 0) {
            return;
        }

        setAssistError(null);
        setIsFixingErrors(true);

        try {
            const response = await requestArabicLeakCorrections({
                data: {
                    excerpts: selectedBatchRows.map((row) => ({
                        arabic: row.arabic!,
                        filePath: row.filePath,
                        id: row.id!,
                        leakHints: row.arabicLeakHints,
                        translation: row.translation!,
                    })),
                    providerId: getStoredAssistProvider() ?? undefined,
                    scope: 'batch',
                    task: 'arabic_leak_correction',
                },
            });

            const { issues, nextEdits, updatedRowCount } = applyArabicLeakCorrectionsToInvalidRows(
                selectedBatchRows,
                pendingEdits,
                response.corrections,
                response.patchMetadata,
            );

            if (updatedRowCount === 0) {
                setAssistError(issues[0] ?? 'The assistant did not return any usable Arabic leak corrections.');
                return;
            }

            startTransition(() => {
                setPendingEdits(nextEdits);
                setAssistError(issues[0] ?? null);
            });
        } catch (error) {
            setAssistError(error instanceof Error ? error.message : 'Failed to request Arabic leak corrections.');
        } finally {
            setIsFixingErrors(false);
        }
    };

    const handleCommitPending = async () => {
        if (pendingEditCount === 0 || isCommitting) {
            return;
        }

        setIsCommitting(true);
        try {
            const committedRowKeys = await commitInvalidPendingEdits({
                commitPatch: (pendingEdit) =>
                    commitTranslationPatch({
                        data: {
                            excerptId: pendingEdit.excerptId,
                            patch: pendingEdit.patch,
                            patchMetadata: pendingEdit.metadata,
                            relativePath: pendingEdit.filePath,
                        },
                    }),
                invalidate: () => router.invalidate({ sync: true }),
                pendingEdits,
            });

            startTransition(() => {
                setPendingEdits({});
                setAssistError(null);
                setResolvedRowKeys((currentKeys) => [...currentKeys, ...committedRowKeys]);
                setSelectedRowKeys([]);
            });
        } catch (error) {
            setAssistError(error instanceof Error ? error.message : 'Failed to commit translation patches.');
        } finally {
            setIsCommitting(false);
        }
    };

    return (
        <>
            <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
                <SidebarTrigger className="-ml-1" />
                <Separator className="mr-2 data-[orientation=vertical]:h-4" orientation="vertical" />
                <Breadcrumb>
                    <BreadcrumbList>
                        <BreadcrumbItem>
                            <BreadcrumbPage>Invalid Excerpts</BreadcrumbPage>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>
            </header>

            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="rounded-xl border bg-card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <h2 className="font-semibold text-base">Validation Queue</h2>
                            <p className="mt-2 text-muted-foreground text-sm">
                                {visibleRows.length} invalid excerpt rows shown across {data.invalidFileCount} files.
                            </p>
                            {assistError ? <p className="mt-2 text-destructive text-xs">{assistError}</p> : null}
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                className="inline-flex h-10 items-center justify-center rounded-md border border-amber-400/40 bg-amber-50 px-3 font-medium text-amber-950 text-sm shadow-sm transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={selectedBatchRows.length === 0 || isFixingErrors || pendingEditCount > 0}
                                onClick={handleFixErrors}
                                type="button"
                            >
                                <Wrench className="mr-2 size-4" />
                                {isFixingErrors ? 'Fixing Errors...' : 'Fix'}
                            </button>
                            <button
                                className="inline-flex h-10 items-center justify-center rounded-md border border-amber-500/30 bg-amber-50 px-3 font-medium text-amber-900 text-sm shadow-sm transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={pendingEditCount === 0 || isCommitting}
                                onClick={handleCommitPending}
                                type="button"
                            >
                                {getCommitButtonLabel(pendingEditCount, isCommitting)}
                            </button>
                        </div>
                    </div>

                    <div className="mt-4 max-w-xs space-y-2">
                        <label
                            className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide"
                            htmlFor="invalid-error-type"
                        >
                            Error Type
                        </label>
                        <select
                            aria-label="Filter invalid excerpts by error type"
                            className="h-9 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            id="invalid-error-type"
                            value={selectedErrorType}
                            onChange={(event) => setSelectedErrorType(event.target.value)}
                        >
                            {errorTypeOptions.map((errorType) => (
                                <option key={errorType} value={errorType}>
                                    {errorType === 'all' ? 'All Errors' : getErrorTypeLabel(errorType)}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="overflow-hidden rounded-xl border bg-card">
                    <div className="overflow-auto">
                        <table className="min-w-full">
                            <thead className="bg-muted/50">
                                <tr className="border-b">
                                    <th className="w-10 px-4 py-2 text-left font-medium text-[10px]"> </th>
                                    <th className="px-4 py-2 text-left font-medium text-[10px]">File</th>
                                    <th className="w-16 px-4 py-2 text-left font-medium text-[10px]">ID</th>
                                    <th className="w-1/2 px-4 py-2 text-right font-medium">Arabic</th>
                                    <th className="w-1/2 px-4 py-2 text-left font-medium text-xs">Translation</th>
                                    <th className="px-4 py-2 text-left font-medium text-xs">Errors</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleRows.map((row) => (
                                    <tr
                                        className={
                                            row.id && pendingEdits[getInvalidPendingEditKey(row.filePath, row.id)]
                                                ? 'border-b bg-amber-50 align-top shadow-[inset_0_0_0_1px_hsl(var(--amber-400)/0.35)] last:border-b-0'
                                                : 'border-b align-top last:border-b-0'
                                        }
                                        key={`${row.filePath}:${row.id ?? 'global'}:${row.messages.join('|')}`}
                                    >
                                        <td className="px-4 py-3 align-top">
                                            {isFixableArabicLeakRow(row) ? (
                                                <input
                                                    aria-label={`Select ${row.id} for fixing`}
                                                    checked={selectedRowKeys.includes(getRowKey(row))}
                                                    className="size-4 rounded border-input align-top"
                                                    disabled={
                                                        pendingEditCount > 0 ||
                                                        (!selectedRowKeys.includes(getRowKey(row)) &&
                                                            selectedRowKeys.length >= MAX_FIX_SELECTION_SIZE)
                                                    }
                                                    onChange={(event) =>
                                                        handleToggleRowSelection(
                                                            getRowKey(row),
                                                            event.currentTarget.checked,
                                                            event.nativeEvent instanceof MouseEvent
                                                                ? event.nativeEvent.shiftKey
                                                                : false,
                                                        )
                                                    }
                                                    type="checkbox"
                                                />
                                            ) : null}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">
                                            <Link
                                                className="text-primary underline-offset-4 hover:underline"
                                                params={{ fileNameId: encodeURIComponent(row.filePath) }}
                                                to="/translations/$fileNameId"
                                            >
                                                {row.filePath}
                                            </Link>
                                        </td>
                                        <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">
                                            {row.id ?? 'File error'}
                                        </td>
                                        <td className="whitespace-pre-wrap px-4 py-3 align-top text-sm" dir="rtl">
                                            {row.arabic ?? '—'}
                                        </td>
                                        <td className="px-4 py-3 align-top text-[10px] leading-normal">
                                            {isEditableTranslationRow(row) ? (
                                                <EditableTranslationContent
                                                    ariaLabel={`Edit translation for ${row.id}`}
                                                    buttonClassName="block w-full rounded border border-input bg-background px-3 py-2 text-left shadow-sm transition-colors hover:bg-muted/40"
                                                    editable
                                                    isEditing={editingRowKey === getRowKey(row)}
                                                    onCommit={(nextText) => {
                                                        handleDraftChange(row, nextText);
                                                    }}
                                                    onStartEditing={() => setEditingRowKey(getRowKey(row))}
                                                    onStopEditing={() => setEditingRowKey(null)}
                                                    patchHighlights={row.patchHighlights}
                                                    text={row.translation}
                                                    textClassName="whitespace-pre-wrap"
                                                    textareaClassName="block w-full resize-none overflow-hidden rounded border border-input bg-background px-3 py-2 text-[10px] leading-normal shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                                                    validationHighlightRanges={row.validationHighlightRanges}
                                                />
                                            ) : (
                                                '—'
                                            )}
                                        </td>
                                        <td className="max-w-md px-4 py-3 align-top text-xs">
                                            <ul className="space-y-1">
                                                {row.messages.map((message) => (
                                                    <li key={message}>{message}</li>
                                                ))}
                                            </ul>
                                        </td>
                                    </tr>
                                ))}
                                {visibleRows.length === 0 ? (
                                    <tr>
                                        <td className="px-4 py-8 text-center text-muted-foreground" colSpan={6}>
                                            No invalid excerpts found for this error type.
                                        </td>
                                    </tr>
                                ) : null}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </>
    );
};

export default InvalidExcerptsPage;

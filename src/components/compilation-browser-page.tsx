'use client';

import { useNavigate } from '@tanstack/react-router';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';

import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { type CompilationBrowseRouteSearch, sanitizeSearch } from '@/lib/browse-search';
import { formatCompilationRowsWithPrompt, getNextCompilationSelectedRowIds } from '@/lib/compilation-browser-selection';
import {
    COMPILATION_BROWSE_PAGE_SIZE_OPTIONS,
    type CompilationCollectionKey,
    DEFAULT_COMPILATION_BROWSE_COLLECTION,
    DEFAULT_COMPILATION_BROWSE_PAGE,
    DEFAULT_COMPILATION_BROWSE_PAGE_SIZE,
} from '@/lib/compilation-browser-shared';
import { fetchPromptStateData } from '@/lib/server-functions';
import type { CompilationBrowsePageData, CompilationBrowseResponse, CompilationBrowseRow } from '@/lib/shell-types';
import { formatUnixSecondsToUtcString } from '@/lib/time';

type CompilationBrowserPageProps = { data: CompilationBrowsePageData; search: CompilationBrowseRouteSearch };

type CompilationSearchPatch = { collection?: CompilationCollectionKey; page?: number; pageSize?: number };

const COLLECTION_LABELS: Record<CompilationCollectionKey, string> = {
    excerpts: 'Excerpts',
    footnotes: 'Footnotes',
    headings: 'Headings',
};

const COLLECTION_KEYS = Object.keys(COLLECTION_LABELS) as CompilationCollectionKey[];

const buildContextLabel = (row: CompilationBrowseRow) => {
    const parts = [
        typeof row.from === 'number' ? `from ${row.from}` : null,
        typeof row.to === 'number' ? `to ${row.to}` : null,
        row.parent ? `parent ${row.parent}` : null,
        row.num ? `num ${row.num}` : null,
        typeof row.translator === 'number' ? `translator ${row.translator}` : null,
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(' · ') : '—';
};

const getPageRangeLabel = (browse: CompilationBrowseResponse) => {
    if (browse.rows.length === 0) {
        return '0';
    }

    const startRow = (browse.pagination.page - 1) * browse.pagination.pageSize + 1;
    const endRow = startRow + browse.rows.length - 1;
    return `${startRow.toLocaleString()}-${endRow.toLocaleString()}`;
};

const getNextSearch = (
    search: CompilationBrowseRouteSearch,
    currentCollection: CompilationCollectionKey,
    currentPage: number,
    currentPageSize: number,
    patch: CompilationSearchPatch,
) =>
    sanitizeSearch({
        ...search,
        collection:
            (patch.collection ?? currentCollection) === DEFAULT_COMPILATION_BROWSE_COLLECTION
                ? undefined
                : (patch.collection ?? currentCollection),
        page: (patch.page ?? currentPage) === DEFAULT_COMPILATION_BROWSE_PAGE ? undefined : (patch.page ?? currentPage),
        pageSize:
            (patch.pageSize ?? currentPageSize) === DEFAULT_COMPILATION_BROWSE_PAGE_SIZE
                ? undefined
                : (patch.pageSize ?? currentPageSize),
    });

const getSelectedRows = (browse: CompilationBrowseResponse | null, selectedRowIds: string[]) => {
    if (!browse || selectedRowIds.length === 0) {
        return [];
    }

    const selectedRowIdSet = new Set(selectedRowIds);
    return browse.rows.filter((row) => selectedRowIdSet.has(row.id));
};

const SummaryCards = ({ browse }: { browse: CompilationBrowseResponse }) => (
    <div className="mt-4 grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-muted-foreground text-xs">Total Rows</p>
            <p className="mt-1 font-semibold text-2xl">{browse.summary.total.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-muted-foreground text-xs">Translated</p>
            <p className="mt-1 font-semibold text-2xl text-green-700">{browse.summary.translated.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-muted-foreground text-xs">Untranslated</p>
            <p className="mt-1 font-semibold text-2xl text-amber-700">{browse.summary.untranslated.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-muted-foreground text-xs">Showing</p>
            <p className="mt-1 font-semibold text-2xl">{getPageRangeLabel(browse)}</p>
        </div>
    </div>
);

const CompilationToolbar = ({
    browse,
    collection,
    copyError,
    copySuccess,
    currentPage,
    currentPageSize,
    isCopying,
    onCopyWithPrompt,
    onPageInputChange,
    onPageSubmit,
    pageInput,
    selectedRowCount,
    updateSearch,
}: {
    browse: CompilationBrowseResponse;
    collection: CompilationCollectionKey;
    copyError: string | null;
    copySuccess: string | null;
    currentPage: number;
    currentPageSize: number;
    isCopying: boolean;
    onCopyWithPrompt: () => void;
    onPageInputChange: (value: string) => void;
    onPageSubmit: (event: FormEvent<HTMLFormElement>) => void;
    pageInput: string;
    selectedRowCount: number;
    updateSearch: (patch: CompilationSearchPatch) => void;
}) => (
    <>
        <SummaryCards browse={browse} />

        <div className="mt-4 flex flex-col gap-3 rounded-lg border bg-muted/10 p-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-2">
                    <label
                        className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide"
                        htmlFor="compilation-page-size"
                    >
                        Page Size
                    </label>
                    <select
                        className="h-9 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        id="compilation-page-size"
                        onChange={(event) =>
                            updateSearch({
                                page: DEFAULT_COMPILATION_BROWSE_PAGE,
                                pageSize: Number.parseInt(event.target.value, 10),
                            })
                        }
                        value={currentPageSize}
                    >
                        {COMPILATION_BROWSE_PAGE_SIZE_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                                {option}
                            </option>
                        ))}
                    </select>
                </div>

                <form className="flex items-end gap-2" onSubmit={onPageSubmit}>
                    <div className="space-y-2">
                        <label
                            className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide"
                            htmlFor="compilation-page-number"
                        >
                            Page
                        </label>
                        <input
                            className="h-9 w-24 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            id="compilation-page-number"
                            min={1}
                            onChange={(event) => onPageInputChange(event.target.value)}
                            type="number"
                            value={pageInput}
                        />
                    </div>
                    <Button type="submit" variant="outline">
                        Go
                    </Button>
                </form>
            </div>

            <div className="flex flex-wrap gap-2">
                <Button disabled={selectedRowCount === 0 || isCopying} onClick={onCopyWithPrompt} variant="outline">
                    {isCopying ? 'Copying...' : 'Copy with Prompt'}
                </Button>
                <Button
                    disabled={!browse.pagination.hasPreviousPage}
                    onClick={() => updateSearch({ page: DEFAULT_COMPILATION_BROWSE_PAGE })}
                    variant="outline"
                >
                    First
                </Button>
                <Button
                    disabled={!browse.pagination.hasPreviousPage}
                    onClick={() => updateSearch({ page: currentPage - 1 })}
                    variant="outline"
                >
                    Previous
                </Button>
                <Button
                    disabled={!browse.pagination.hasNextPage}
                    onClick={() => updateSearch({ page: currentPage + 1 })}
                    variant="outline"
                >
                    Next
                </Button>
                <Button
                    disabled={!browse.pagination.hasNextPage}
                    onClick={() => updateSearch({ page: browse.pagination.totalPages })}
                    variant="outline"
                >
                    Last
                </Button>
            </div>
        </div>

        {copyError ? <p className="mt-3 text-destructive text-sm">{copyError}</p> : null}
        {copySuccess ? <p className="mt-3 text-green-700 text-sm">{copySuccess}</p> : null}

        <div className="mt-4 flex flex-wrap gap-2">
            {COLLECTION_KEYS.map((key) => (
                <Button
                    key={key}
                    onClick={() => updateSearch({ collection: key, page: DEFAULT_COMPILATION_BROWSE_PAGE })}
                    variant={collection === key ? 'default' : 'outline'}
                >
                    {COLLECTION_LABELS[key]}
                </Button>
            ))}
        </div>
    </>
);

const CompilationRowsTable = ({
    browse,
    error,
    onToggleAllRows,
    onToggleRow,
    selectedRowIds,
}: {
    browse: CompilationBrowseResponse | null;
    error: string | null;
    onToggleAllRows: (checked: boolean) => void;
    onToggleRow: (rowId: string, checked: boolean, shiftKey: boolean) => void;
    selectedRowIds: string[];
}) => (
    <div className="overflow-hidden rounded-xl border bg-card">
        <div className="overflow-auto">
            <table className="min-w-full">
                <thead className="bg-muted/50">
                    <tr className="border-b">
                        <th className="w-10 px-4 py-2 text-left font-medium text-xs">
                            {browse ? (
                                <input
                                    aria-label="Select all visible rows"
                                    checked={browse.rows.length > 0 && selectedRowIds.length === browse.rows.length}
                                    className="size-4 rounded border-input align-top"
                                    onChange={(event) => onToggleAllRows(event.currentTarget.checked)}
                                    type="checkbox"
                                />
                            ) : null}
                        </th>
                        <th className="px-4 py-2 text-left font-medium text-xs">ID</th>
                        <th className="px-4 py-2 text-left font-medium text-xs">Context</th>
                        <th className="px-4 py-2 text-right font-medium text-xs">Arabic</th>
                        <th className="px-4 py-2 text-left font-medium text-xs">Translation</th>
                        <th className="px-4 py-2 text-left font-medium text-xs">Updated</th>
                    </tr>
                </thead>
                <tbody>
                    {browse?.rows.map((row) => (
                        <tr
                            className="border-b align-top last:border-b-0"
                            key={`${row.collection}:${row.id}:${row.index}`}
                        >
                            <td className="px-4 py-3 align-top">
                                <input
                                    aria-label={`Select ${row.id}`}
                                    checked={selectedRowIds.includes(row.id)}
                                    className="size-4 rounded border-input align-top"
                                    onChange={(event) =>
                                        onToggleRow(
                                            row.id,
                                            event.currentTarget.checked,
                                            event.nativeEvent instanceof MouseEvent
                                                ? event.nativeEvent.shiftKey
                                                : false,
                                        )
                                    }
                                    type="checkbox"
                                />
                            </td>
                            <td className="px-4 py-3 font-mono text-[11px]">{row.id}</td>
                            <td className="max-w-xs whitespace-pre-wrap px-4 py-3 text-muted-foreground text-xs">
                                {buildContextLabel(row)}
                            </td>
                            <td
                                className="max-w-xl whitespace-pre-wrap px-4 py-3 text-right text-sm"
                                dir="rtl"
                                lang="ar"
                            >
                                {row.nass}
                            </td>
                            <td
                                className="max-w-xl whitespace-pre-wrap px-4 py-3 text-left text-sm"
                                dir="ltr"
                                lang="en"
                            >
                                {row.text ?? '—'}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-muted-foreground text-xs">
                                {formatUnixSecondsToUtcString(row.lastUpdatedAt)}
                            </td>
                        </tr>
                    ))}

                    {!browse || browse.rows.length === 0 ? (
                        <tr>
                            <td className="px-4 py-8 text-center text-muted-foreground text-sm" colSpan={6}>
                                {error ? 'Compilation rows could not be loaded.' : 'No rows found for this page.'}
                            </td>
                        </tr>
                    ) : null}
                </tbody>
            </table>
        </div>
    </div>
);

export const CompilationBrowserPage = ({ data, search }: CompilationBrowserPageProps) => {
    const navigate = useNavigate();
    const browse = data.browse;
    const collection = browse?.collection ?? search.collection ?? DEFAULT_COMPILATION_BROWSE_COLLECTION;
    const currentPage = browse?.pagination.page ?? search.page ?? DEFAULT_COMPILATION_BROWSE_PAGE;
    const currentPageSize = browse?.pagination.pageSize ?? search.pageSize ?? DEFAULT_COMPILATION_BROWSE_PAGE_SIZE;
    const [copyError, setCopyError] = useState<string | null>(null);
    const [copySuccess, setCopySuccess] = useState<string | null>(null);
    const [isCopying, setIsCopying] = useState(false);
    const [lastClickedRowId, setLastClickedRowId] = useState<string | null>(null);
    const [pageInput, setPageInput] = useState(String(currentPage));
    const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);

    useEffect(() => {
        setPageInput(String(currentPage));
    }, [currentPage]);

    useEffect(() => {
        if (!browse) {
            setLastClickedRowId(null);
            setSelectedRowIds([]);
            return;
        }

        const visibleRowIds = new Set(browse.rows.map((row) => row.id));
        setLastClickedRowId((currentLastClickedRowId) =>
            currentLastClickedRowId && visibleRowIds.has(currentLastClickedRowId) ? currentLastClickedRowId : null,
        );
        setSelectedRowIds((currentSelectedRowIds) =>
            currentSelectedRowIds.filter((selectedRowId) => visibleRowIds.has(selectedRowId)),
        );
    }, [browse]);

    const updateSearch = (patch: CompilationSearchPatch) => {
        void navigate({
            resetScroll: false,
            search: getNextSearch(search, collection, currentPage, currentPageSize, patch),
            to: '/compilation',
        });
    };

    const handlePageSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!browse) {
            return;
        }

        const parsedPage = Number.parseInt(pageInput, 10);
        if (!Number.isFinite(parsedPage)) {
            setPageInput(String(currentPage));
            return;
        }

        updateSearch({ page: Math.min(Math.max(1, parsedPage), browse.pagination.totalPages) });
    };

    const handleToggleRow = (rowId: string, checked: boolean, shiftKey: boolean) => {
        const orderedRowIds = browse?.rows.map((row) => row.id) ?? [];

        setSelectedRowIds((currentSelectedRowIds) =>
            getNextCompilationSelectedRowIds({
                checked,
                currentRowIds: currentSelectedRowIds,
                lastClickedRowId,
                orderedRowIds,
                rowId,
                shiftKey,
            }),
        );
        setLastClickedRowId(rowId);
    };

    const handleToggleAllRows = (checked: boolean) => {
        setLastClickedRowId(null);
        setSelectedRowIds(checked ? (browse?.rows.map((row) => row.id) ?? []) : []);
    };

    const handleCopyWithPrompt = async () => {
        const selectedRows = getSelectedRows(browse, selectedRowIds);
        if (selectedRows.length === 0 || isCopying) {
            return;
        }

        try {
            setCopyError(null);
            setCopySuccess(null);
            setIsCopying(true);

            const promptState = await fetchPromptStateData();
            const payload = formatCompilationRowsWithPrompt(promptState.selectedPromptContent, selectedRows);

            await navigator.clipboard.writeText(payload);
            setCopySuccess(`Copied ${selectedRows.length} row${selectedRows.length === 1 ? '' : 's'} with prompt.`);
        } catch (error) {
            setCopyError(error instanceof Error ? error.message : 'Failed to copy prompt and rows.');
        } finally {
            setIsCopying(false);
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
                            <BreadcrumbPage>Compilation Browser</BreadcrumbPage>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>
            </header>

            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="rounded-xl border bg-card p-4">
                    <h2 className="font-semibold text-lg">Compilation Rows</h2>
                    <p className="mt-1 text-muted-foreground text-sm">
                        Page through the canonical compilation JSON without loading the full file into the browser.
                        Arabic source stays RTL and English translation stays LTR.
                    </p>

                    {data.error ? <p className="mt-4 text-destructive text-sm">{data.error}</p> : null}

                    {browse ? (
                        <CompilationToolbar
                            browse={browse}
                            collection={collection}
                            copyError={copyError}
                            copySuccess={copySuccess}
                            currentPage={currentPage}
                            currentPageSize={currentPageSize}
                            isCopying={isCopying}
                            onCopyWithPrompt={handleCopyWithPrompt}
                            onPageInputChange={setPageInput}
                            onPageSubmit={handlePageSubmit}
                            pageInput={pageInput}
                            selectedRowCount={selectedRowIds.length}
                            updateSearch={updateSearch}
                        />
                    ) : null}
                </div>

                <CompilationRowsTable
                    browse={browse}
                    error={data.error}
                    onToggleAllRows={handleToggleAllRows}
                    onToggleRow={handleToggleRow}
                    selectedRowIds={selectedRowIds}
                />
            </div>
        </>
    );
};

export default CompilationBrowserPage;

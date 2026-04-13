import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router';
import { ChevronDown } from 'lucide-react';
import { startTransition, useEffect, useState } from 'react';
import { ConversationView } from '@/components/conversation-view';
import { DeleteButton } from '@/components/delete-button';
import { TranslationTableView } from '@/components/translations/translation-table-view';
import { getStoredAssistProvider } from '@/lib/assist-provider-storage';
import { storeArabicLeakCorrections } from '@/lib/arabic-leak-storage';
import { parseTranslationRouteSearch, pickBrowseFilters } from '@/lib/browse-search';
import {
    commitTranslationPatch,
    deleteTranslationFile,
    fetchTranslationFileData,
    requestArabicLeakCorrections,
    setTranslationSkip,
} from '@/lib/server-functions';
import type { TranslationFileResponse } from '@/lib/shell-types';
import {
    applyAllCapsCorrectionsToPendingEdits,
    applyArabicLeakCorrectionsToPendingEdits,
    buildPatchedConversation,
    buildTranslationTableModel,
    getCommitButtonLabel,
    isFileViewMode,
    mergePersistedRuptureMeta,
    type PendingEditMap,
    updatePendingEdits,
} from '@/lib/translation-file-view-model';
import { parseTranslationToCommon } from '@/lib/translation-parser';

export const Route = createFileRoute('/_browse/translations/$fileNameId')({
    component: TranslationFilePage,
    loader: async ({ params }) => {
        const relativePath = decodeURIComponent(params.fileNameId);
        return fetchTranslationFileData({ data: { relativePath } });
    },
    validateSearch: parseTranslationRouteSearch,
});

function TranslationFilePage() {
    return <TranslationFileContent />;
}

function TranslationFileContent() {
    const navigate = useNavigate();
    const router = useRouter();
    const fileData = Route.useLoaderData() as TranslationFileResponse;
    const params = Route.useParams();
    const search = Route.useSearch();
    const [content, setContent] = useState<unknown>(fileData.content);
    const [pendingEdits, setPendingEdits] = useState<PendingEditMap>({});
    const [fixError, setFixError] = useState<string | null>(null);
    const [isFixingErrors, setIsFixingErrors] = useState(false);
    const [isCommitting, setIsCommitting] = useState(false);
    const [skippingRowId, setSkippingRowId] = useState<string | null>(null);
    const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
    const view = isFileViewMode(search.view ?? null) ? (search.view ?? 'table') : 'table';
    const filePath = fileData.relativePath;

    useEffect(() => {
        setContent(fileData.content);
        setPendingEdits({});
        setFixError(null);
        setIsFixingErrors(false);
        setIsCommitting(false);
        setSkippingRowId(null);
        setSelectedRowIds([]);
    }, [fileData.content]);

    let conversation = null;
    try {
        conversation = parseTranslationToCommon(content);
    } catch {
        conversation = null;
    }

    const pendingEditCount = Object.keys(pendingEdits).length;
    const tableModel = buildTranslationTableModel(conversation, pendingEdits, filePath);
    const patchedConversation = buildPatchedConversation(conversation, pendingEdits);
    const fileName = filePath.split('/').at(-1) ?? 'file.json';
    const normalizedJsonViewValue = patchedConversation ?? conversation;

    useEffect(() => {
        if (!tableModel) {
            setSelectedRowIds((currentIds) => (currentIds.length === 0 ? currentIds : []));
            return;
        }

        const validRowIds = new Set(tableModel.rows.map((row) => row.id));
        setSelectedRowIds((currentIds) => {
            const nextIds = currentIds.filter((id) => validRowIds.has(id));
            return nextIds.length === currentIds.length ? currentIds : nextIds;
        });
    }, [tableModel]);

    const handleDraftChange = (excerptId: string, originalText: string, nextText: string) => {
        setPendingEdits((currentEdits) => updatePendingEdits(currentEdits, excerptId, originalText, nextText));
    };

    const handleAutoFixErrors = async () => {
        if (
            !tableModel ||
            (tableModel.arabicLeakExcerpts.length === 0 && tableModel.allCapsExcerpts.length === 0) ||
            isFixingErrors
        ) {
            return;
        }

        setIsFixingErrors(true);
        setFixError(null);

        try {
            let nextEdits = pendingEdits;
            const issues: string[] = [];
            let updatedRowCount = 0;

            for (const task of ['arabic_leak_correction', 'all_caps_correction'] as const) {
                let currentModel = buildTranslationTableModel(conversation, nextEdits, filePath);
                let excerpts =
                    task === 'arabic_leak_correction'
                        ? (currentModel?.arabicLeakExcerpts ?? [])
                        : (currentModel?.allCapsExcerpts ?? []);

                if (excerpts.length === 0) {
                    continue;
                }

                const response = await requestArabicLeakCorrections({
                    data: { excerpts, providerId: getStoredAssistProvider() ?? undefined, scope: 'file', task },
                });

                const result =
                    task === 'arabic_leak_correction'
                        ? applyArabicLeakCorrectionsToPendingEdits(
                              currentModel,
                              nextEdits,
                              response.corrections,
                              response.patchMetadata,
                              filePath,
                          )
                        : applyAllCapsCorrectionsToPendingEdits(
                              currentModel,
                              nextEdits,
                              response.corrections,
                              response.patchMetadata,
                              filePath,
                          );

                nextEdits = result.nextEdits;
                issues.push(...result.issues);
                updatedRowCount += result.updatedRowCount;

                if (task === 'arabic_leak_correction' && response.corrections.length > 0) {
                    storeArabicLeakCorrections({ corrections: response.corrections, patchMetadata: response.patchMetadata });
                }
            }

            if (updatedRowCount === 0) {
                setFixError(issues[0] ?? 'The assistant did not return any usable corrections.');
                return;
            }
            startTransition(() => {
                setPendingEdits(nextEdits);
                setFixError(issues[0] ?? null);
            });
        } catch (error) {
            setFixError(error instanceof Error ? error.message : 'Failed to request automated corrections.');
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
            let latestFile: Awaited<ReturnType<typeof fetchTranslationFileData>> | null = null;

            for (const [excerptId, pendingEdit] of Object.entries(pendingEdits)) {
                latestFile = await commitTranslationPatch({
                    data: {
                        excerptId,
                        patch: pendingEdit.patch,
                        patchMetadata: pendingEdit.metadata,
                        relativePath: filePath,
                    },
                });
            }

            if (latestFile) {
                const nextContent = mergePersistedRuptureMeta(content, latestFile.content);
                startTransition(() => {
                    setContent(nextContent);
                    setPendingEdits({});
                });
                await router.invalidate({ sync: true });
            }
        } catch (error) {
            console.error('Failed to commit translation patches', error);
        } finally {
            setIsCommitting(false);
        }
    };

    const handleFileDeleted = async () => {
        await deleteTranslationFile({ data: { relativePath: filePath } });
        await router.invalidate({ sync: true });
        await navigate({ search: pickBrowseFilters(search), to: '/' });
    };

    const handleToggleSkip = async (excerptId: string, skipped: boolean) => {
        if (skippingRowId) {
            return;
        }

        setSkippingRowId(excerptId);
        try {
            const latestFile = await setTranslationSkip({ data: { excerptId, relativePath: filePath, skipped } });

            const nextContent = mergePersistedRuptureMeta(content, latestFile.content);
            startTransition(() => {
                setContent(nextContent);
                setPendingEdits((currentEdits) => {
                    if (!(excerptId in currentEdits)) {
                        return currentEdits;
                    }

                    const nextEdits = { ...currentEdits };
                    delete nextEdits[excerptId];
                    return nextEdits;
                });
                setSelectedRowIds((currentIds) => currentIds.filter((id) => id !== excerptId));
            });
            await router.invalidate({ sync: true });
        } catch (error) {
            console.error('Failed to update skipped excerpt state', error);
        } finally {
            setSkippingRowId(null);
        }
    };

    const handleToggleSelectRow = (excerptId: string, checked: boolean) => {
        setSelectedRowIds((currentIds) =>
            checked
                ? currentIds.includes(excerptId)
                    ? currentIds
                    : [...currentIds, excerptId]
                : currentIds.filter((id) => id !== excerptId),
        );
    };

    const handleToggleSelectAllRows = (checked: boolean) => {
        setSelectedRowIds(checked ? (tableModel?.rows.map((row) => row.id) ?? []) : []);
    };

    const handleBulkSetSkip = async (skipped: boolean) => {
        if (selectedRowIds.length === 0 || skippingRowId || !tableModel) {
            return;
        }

        setSkippingRowId('__bulk__');
        try {
            let latestFile: TranslationFileResponse | null = null;
            const targetRows = tableModel.rows.filter(
                (row) => selectedRowIds.includes(row.id) && row.isSkipped !== skipped,
            );

            for (const row of targetRows) {
                latestFile = await setTranslationSkip({ data: { excerptId: row.id, relativePath: filePath, skipped } });
            }

            if (latestFile) {
                const nextContent = mergePersistedRuptureMeta(content, latestFile.content);
                const targetRowIds = new Set(targetRows.map((row) => row.id));
                startTransition(() => {
                    setContent(nextContent);
                    setPendingEdits((currentEdits) =>
                        Object.fromEntries(
                            Object.entries(currentEdits).filter(([excerptId]) => !targetRowIds.has(excerptId)),
                        ),
                    );
                    setSelectedRowIds([]);
                });
                await router.invalidate({ sync: true });
            }
        } catch (error) {
            console.error('Failed to update skipped excerpt state in bulk', error);
        } finally {
            setSkippingRowId(null);
        }
    };

    const sourceAlignmentNotice =
        tableModel?.isSourceAlignedToResponse && tableModel.sourceIds.length > 0 ? (
            <div className="rounded-md border border-amber-400/30 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                <p className="font-medium">The source excerpts in this file were aligned to the final response block.</p>
                <p className="mt-1 text-muted-foreground">
                    This usually means the prompt contains example or duplicated source sections before the real translation
                    block.
                </p>
            </div>
        ) : null;

    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="flex items-center justify-end gap-2">
                <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-sm">View</span>
                    <div className="relative">
                        <select
                            aria-label="View mode"
                            className="h-10 appearance-none rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm ring-offset-background transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            value={view}
                            onChange={(event) =>
                                void navigate({
                                    params: { fileNameId: params.fileNameId },
                                    resetScroll: false,
                                    search: (previousSearch) => {
                                        const nextSearch = { ...previousSearch };

                                        if (event.target.value === 'table') {
                                            delete nextSearch.view;
                                        } else {
                                            nextSearch.view = event.target.value;
                                        }

                                        return nextSearch;
                                    },
                                    to: '/translations/$fileNameId',
                                })
                            }
                        >
                            <option value="table">Table</option>
                            <option value="normal">Normal</option>
                            <option value="normalized">Normalized</option>
                            <option value="json">Raw</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    </div>
                </div>
                <button
                    className="inline-flex h-10 items-center justify-center rounded-md border border-amber-500/30 bg-amber-50 px-3 font-medium text-amber-900 text-sm shadow-sm transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={pendingEditCount === 0 || isCommitting}
                    onClick={handleCommitPending}
                    type="button"
                >
                    {getCommitButtonLabel(pendingEditCount, isCommitting)}
                </button>
                <DeleteButton fileName={fileName} onDelete={handleFileDeleted} />
            </div>

            <div className={view === 'table' ? 'flex-1 min-h-0 overflow-hidden' : 'flex-1 min-h-0 overflow-auto'}>
                {sourceAlignmentNotice}
                {view === 'json' ? (
                    <pre className="h-full whitespace-pre-wrap break-words rounded-md bg-muted p-4 text-xs leading-5 [overflow-wrap:anywhere]">
                        {JSON.stringify(content, null, 2)}
                    </pre>
                ) : view === 'normalized' ? (
                    normalizedJsonViewValue ? (
                        <pre className="h-full whitespace-pre-wrap break-words rounded-md bg-muted p-4 text-xs leading-5 [overflow-wrap:anywhere]">
                            {JSON.stringify(normalizedJsonViewValue, null, 2)}
                        </pre>
                    ) : (
                        <div className="flex h-full min-h-0 flex-col items-center justify-center">
                            <p className="text-muted-foreground text-sm">Failed to normalize conversation.</p>
                        </div>
                    )
                ) : view === 'normal' ? (
                    patchedConversation ? (
                        <ConversationView conversation={patchedConversation} />
                    ) : (
                        <div className="flex h-full min-h-0 flex-col items-center justify-center">
                            <p className="text-muted-foreground text-sm">Failed to parse conversation.</p>
                        </div>
                    )
                ) : (
                    <TranslationTableView
                        arabicLeakFixError={fixError}
                        isFixingArabicLeaks={isFixingErrors}
                        isUpdatingSkip={Boolean(skippingRowId)}
                        model={tableModel}
                        onAutoFixArabicLeaks={handleAutoFixErrors}
                        onBulkSetSkip={handleBulkSetSkip}
                        onDraftChange={handleDraftChange}
                        onToggleSelectAll={handleToggleSelectAllRows}
                        onToggleSelectRow={handleToggleSelectRow}
                        onToggleSkip={handleToggleSkip}
                        selectedRowIds={selectedRowIds}
                        skippingRowId={skippingRowId}
                    />
                )}
            </div>
        </div>
    );
}

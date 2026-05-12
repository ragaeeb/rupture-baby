import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router';
import { ChevronDown } from 'lucide-react';
import { startTransition, useEffect, useMemo, useState } from 'react';
import { ConversationView } from '@/components/conversation-view';
import { DeleteButton } from '@/components/delete-button';
import { TranslationTableView } from '@/components/translations/translation-table-view';
import { storeArabicLeakCorrections } from '@/lib/arabic-leak-storage';
import { getStoredAssistProvider } from '@/lib/assist-provider-storage';
import { parseTranslationRouteSearch, pickBrowseFilters } from '@/lib/browse-search';
import {
    commitTranslationPatch,
    commitTranslationPatches,
    deleteTranslationFile,
    fetchTranslationFileData,
    requestArabicLeakCorrections,
    setTranslationSkip,
    setTranslationSkips,
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

const AUTO_FIX_TASKS = ['arabic_leak_correction', 'all_caps_correction'] as const;

const getTaskExcerpts = (
    model: ReturnType<typeof buildTranslationTableModel>,
    task: (typeof AUTO_FIX_TASKS)[number],
) => (task === 'arabic_leak_correction' ? (model?.arabicLeakExcerpts ?? []) : (model?.allCapsExcerpts ?? []));

const applyTaskCorrectionsToPendingEdits = ({
    currentModel,
    filePath,
    nextEdits,
    response,
    task,
}: {
    currentModel: ReturnType<typeof buildTranslationTableModel>;
    filePath: string;
    nextEdits: PendingEditMap;
    response: Awaited<ReturnType<typeof requestArabicLeakCorrections>>;
    task: (typeof AUTO_FIX_TASKS)[number];
}) =>
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

const buildSourceAlignmentNotice = (tableModel: ReturnType<typeof buildTranslationTableModel>) =>
    tableModel?.isSourceAlignedToResponse && tableModel.sourceIds.length > 0 ? (
        <div className="rounded-md border border-amber-400/30 bg-amber-50 px-4 py-3 text-amber-950 text-sm">
            <p className="font-medium">The source excerpts in this file were aligned to the final response block.</p>
            <p className="mt-1 text-muted-foreground">
                This usually means the prompt contains example or duplicated source sections before the real translation
                block.
            </p>
        </div>
    ) : null;

const resetTranslationFileState = ({
    setContent,
    setFixError,
    setIsCommitting,
    setIsFixingErrors,
    setPendingEdits,
    setSelectedRowIds,
    setSkippingRowId,
    nextContent,
}: {
    nextContent: unknown;
    setContent: (value: unknown) => void;
    setFixError: (value: string | null) => void;
    setIsCommitting: (value: boolean) => void;
    setIsFixingErrors: (value: boolean) => void;
    setPendingEdits: (value: PendingEditMap) => void;
    setSelectedRowIds: (value: string[]) => void;
    setSkippingRowId: (value: string | null) => void;
}) => {
    setContent(nextContent);
    setPendingEdits({});
    setFixError(null);
    setIsFixingErrors(false);
    setIsCommitting(false);
    setSkippingRowId(null);
    setSelectedRowIds([]);
};

const syncSelectedRowIdsWithTableModel = (
    currentIds: string[],
    tableModel: ReturnType<typeof buildTranslationTableModel>,
) => {
    if (!tableModel) {
        return currentIds.length === 0 ? currentIds : [];
    }

    const validRowIds = new Set(tableModel.rows.map((row) => row.id));
    const nextIds = currentIds.filter((id) => validRowIds.has(id));
    return nextIds.length === currentIds.length ? currentIds : nextIds;
};

const hasFixableErrors = (tableModel: ReturnType<typeof buildTranslationTableModel>) =>
    Boolean(tableModel && (tableModel.arabicLeakExcerpts.length > 0 || tableModel.allCapsExcerpts.length > 0));

type TranslationFileViewportProps = {
    content: unknown;
    fileName: string;
    fixError: string | null;
    isCommitting: boolean;
    isFixingErrors: boolean;
    normalizedJsonViewValue: ReturnType<typeof buildPatchedConversation> | ReturnType<typeof parseTranslationToCommon>;
    onAutoFixErrors: () => void;
    onBulkSetSkip: (skipped: boolean) => void;
    onCommitPending: () => void;
    onDeleteFile: () => Promise<void>;
    onDraftChange: (excerptId: string, originalText: string, nextText: string) => void;
    onToggleSelectAllRows: (checked: boolean) => void;
    onToggleSelectRow: (excerptId: string, checked: boolean) => void;
    onToggleSkip: (excerptId: string, skipped: boolean) => void;
    onViewChange: (nextView: string) => void;
    patchedConversation: ReturnType<typeof buildPatchedConversation>;
    pendingEditCount: number;
    selectedRowIds: string[];
    skippingRowId: string | null;
    tableModel: ReturnType<typeof buildTranslationTableModel>;
    view: 'json' | 'normal' | 'normalized' | 'table';
};

const TranslationFileViewport = ({
    content,
    fileName,
    fixError,
    isCommitting,
    isFixingErrors,
    normalizedJsonViewValue,
    onAutoFixErrors,
    onBulkSetSkip,
    onCommitPending,
    onDeleteFile,
    onDraftChange,
    onToggleSelectAllRows,
    onToggleSelectRow,
    onToggleSkip,
    onViewChange,
    patchedConversation,
    pendingEditCount,
    selectedRowIds,
    skippingRowId,
    tableModel,
    view,
}: TranslationFileViewportProps) => (
    <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="flex items-center justify-end gap-2">
            <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">View</span>
                <div className="relative">
                    <select
                        aria-label="View mode"
                        className="h-10 appearance-none rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm ring-offset-background transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        onChange={(event) => onViewChange(event.target.value)}
                        value={view}
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
                onClick={onCommitPending}
                type="button"
            >
                {getCommitButtonLabel(pendingEditCount, isCommitting)}
            </button>
            <DeleteButton fileName={fileName} onDelete={onDeleteFile} />
        </div>

        <div className={view === 'table' ? 'min-h-0 flex-1 overflow-hidden' : 'min-h-0 flex-1 overflow-auto'}>
            {buildSourceAlignmentNotice(tableModel)}
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
                    onAutoFixArabicLeaks={onAutoFixErrors}
                    onBulkSetSkip={onBulkSetSkip}
                    onDraftChange={onDraftChange}
                    onToggleSelectAll={onToggleSelectAllRows}
                    onToggleSelectRow={onToggleSelectRow}
                    onToggleSkip={onToggleSkip}
                    selectedRowIds={selectedRowIds}
                    skippingRowId={skippingRowId}
                />
            )}
        </div>
    </div>
);

const runAutoFixTasks = async ({
    conversation,
    filePath,
    pendingEdits,
}: {
    conversation: ReturnType<typeof parseTranslationToCommon> | null;
    filePath: string;
    pendingEdits: PendingEditMap;
}) => {
    let nextEdits = pendingEdits;
    const issues: string[] = [];
    let updatedRowCount = 0;

    for (const task of AUTO_FIX_TASKS) {
        const currentModel = buildTranslationTableModel(conversation, nextEdits, filePath);
        const excerpts = getTaskExcerpts(currentModel, task);

        if (excerpts.length === 0) {
            continue;
        }

        const response = await requestArabicLeakCorrections({
            data: { excerpts, providerId: getStoredAssistProvider() ?? undefined, scope: 'file', task },
        });

        const result = applyTaskCorrectionsToPendingEdits({ currentModel, filePath, nextEdits, response, task });

        nextEdits = result.nextEdits;
        issues.push(...result.issues);
        updatedRowCount += result.updatedRowCount;

        if (task === 'arabic_leak_correction' && response.corrections.length > 0) {
            storeArabicLeakCorrections({ corrections: response.corrections, patchMetadata: response.patchMetadata });
        }
    }

    return { issues, nextEdits, updatedRowCount };
};

const runAutoFixErrors = async ({
    conversation,
    filePath,
    isFixingErrors,
    pendingEdits,
    setFixError,
    setIsFixingErrors,
    setPendingEdits,
    tableModel,
}: {
    conversation: ReturnType<typeof parseTranslationToCommon> | null;
    filePath: string;
    isFixingErrors: boolean;
    pendingEdits: PendingEditMap;
    setFixError: (value: string | null) => void;
    setIsFixingErrors: (value: boolean) => void;
    setPendingEdits: (value: PendingEditMap) => void;
    tableModel: ReturnType<typeof buildTranslationTableModel>;
}) => {
    if (!tableModel || !hasFixableErrors(tableModel) || isFixingErrors) {
        return;
    }

    setIsFixingErrors(true);
    setFixError(null);

    try {
        const { issues, nextEdits, updatedRowCount } = await runAutoFixTasks({ conversation, filePath, pendingEdits });

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

const commitPendingTranslationEdits = async ({
    content,
    filePath,
    pendingEdits,
    router,
    setContent,
    setPendingEdits,
}: {
    content: unknown;
    filePath: string;
    pendingEdits: PendingEditMap;
    router: ReturnType<typeof useRouter>;
    setContent: (value: unknown) => void;
    setPendingEdits: (value: PendingEditMap | ((current: PendingEditMap) => PendingEditMap)) => void;
}) => {
    const operations = Object.entries(pendingEdits).map(([excerptId, pendingEdit]) => ({
        excerptId,
        patch: pendingEdit.patch,
        patchMetadata: pendingEdit.metadata,
    }));
    const latestFile =
        operations.length === 1
            ? await commitTranslationPatch({
                  data: {
                      excerptId: operations[0].excerptId,
                      patch: operations[0].patch,
                      patchMetadata: operations[0].patchMetadata,
                      relativePath: filePath,
                  },
              })
            : await commitTranslationPatches({ data: { operations, relativePath: filePath } });

    if (!latestFile) {
        return;
    }

    const nextContent = mergePersistedRuptureMeta(content, latestFile.content);
    startTransition(() => {
        setContent(nextContent);
        setPendingEdits({});
    });
    await router.invalidate({ sync: true });
};

const commitPendingTranslationEditsSafely = async ({
    content,
    filePath,
    isCommitting,
    pendingEditCount,
    pendingEdits,
    router,
    setContent,
    setIsCommitting,
    setPendingEdits,
}: {
    content: unknown;
    filePath: string;
    isCommitting: boolean;
    pendingEditCount: number;
    pendingEdits: PendingEditMap;
    router: ReturnType<typeof useRouter>;
    setContent: (value: unknown) => void;
    setIsCommitting: (value: boolean) => void;
    setPendingEdits: (value: PendingEditMap | ((current: PendingEditMap) => PendingEditMap)) => void;
}) => {
    if (pendingEditCount === 0 || isCommitting) {
        return;
    }

    setIsCommitting(true);
    try {
        await commitPendingTranslationEdits({ content, filePath, pendingEdits, router, setContent, setPendingEdits });
    } catch (error) {
        console.error('Failed to commit translation patches', error);
    } finally {
        setIsCommitting(false);
    }
};

const updateSingleSkipState = async ({
    content,
    excerptId,
    filePath,
    router,
    setContent,
    setPendingEdits,
    setSelectedRowIds,
    skipped,
}: {
    content: unknown;
    excerptId: string;
    filePath: string;
    router: ReturnType<typeof useRouter>;
    setContent: (value: unknown) => void;
    setPendingEdits: (value: PendingEditMap | ((current: PendingEditMap) => PendingEditMap)) => void;
    setSelectedRowIds: (value: string[] | ((current: string[]) => string[])) => void;
    skipped: boolean;
}) => {
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
};

const updateSingleSkipStateSafely = async ({
    content,
    excerptId,
    filePath,
    router,
    setContent,
    setPendingEdits,
    setSelectedRowIds,
    setSkippingRowId,
    skipped,
    skippingRowId,
}: {
    content: unknown;
    excerptId: string;
    filePath: string;
    router: ReturnType<typeof useRouter>;
    setContent: (value: unknown) => void;
    setPendingEdits: (value: PendingEditMap | ((current: PendingEditMap) => PendingEditMap)) => void;
    setSelectedRowIds: (value: string[] | ((current: string[]) => string[])) => void;
    setSkippingRowId: (value: string | null) => void;
    skipped: boolean;
    skippingRowId: string | null;
}) => {
    if (skippingRowId) {
        return;
    }

    setSkippingRowId(excerptId);
    try {
        await updateSingleSkipState({
            content,
            excerptId,
            filePath,
            router,
            setContent,
            setPendingEdits,
            setSelectedRowIds,
            skipped,
        });
    } catch (error) {
        console.error('Failed to update skipped excerpt state', error);
    } finally {
        setSkippingRowId(null);
    }
};

const updateBulkSkipState = async ({
    content,
    filePath,
    router,
    selectedRowIdSet,
    setContent,
    setPendingEdits,
    setSelectedRowIds,
    skipped,
    tableModel,
}: {
    content: unknown;
    filePath: string;
    router: ReturnType<typeof useRouter>;
    selectedRowIdSet: Set<string>;
    setContent: (value: unknown) => void;
    setPendingEdits: (value: PendingEditMap | ((current: PendingEditMap) => PendingEditMap)) => void;
    setSelectedRowIds: (value: string[]) => void;
    skipped: boolean;
    tableModel: NonNullable<ReturnType<typeof buildTranslationTableModel>>;
}) => {
    const targetRows = tableModel.rows.filter((row) => selectedRowIdSet.has(row.id) && row.isSkipped !== skipped);
    const latestFile: TranslationFileResponse | null =
        targetRows.length === 0
            ? null
            : targetRows.length === 1
              ? await setTranslationSkip({ data: { excerptId: targetRows[0].id, relativePath: filePath, skipped } })
              : await setTranslationSkips({
                    data: {
                        operations: targetRows.map((row) => ({ excerptId: row.id, skipped })),
                        relativePath: filePath,
                    },
                });

    if (!latestFile) {
        return;
    }

    const nextContent = mergePersistedRuptureMeta(content, latestFile.content);
    const targetRowIds = new Set(targetRows.map((row) => row.id));
    startTransition(() => {
        setContent(nextContent);
        setPendingEdits((currentEdits) =>
            Object.fromEntries(Object.entries(currentEdits).filter(([excerptId]) => !targetRowIds.has(excerptId))),
        );
        setSelectedRowIds([]);
    });
    await router.invalidate({ sync: true });
};

const updateBulkSkipStateSafely = async ({
    content,
    filePath,
    router,
    selectedRowIdSet,
    selectedRowIds,
    setContent,
    setPendingEdits,
    setSelectedRowIds,
    setSkippingRowId,
    skipped,
    skippingRowId,
    tableModel,
}: {
    content: unknown;
    filePath: string;
    router: ReturnType<typeof useRouter>;
    selectedRowIdSet: Set<string>;
    selectedRowIds: string[];
    setContent: (value: unknown) => void;
    setPendingEdits: (value: PendingEditMap | ((current: PendingEditMap) => PendingEditMap)) => void;
    setSelectedRowIds: (value: string[]) => void;
    setSkippingRowId: (value: string | null) => void;
    skipped: boolean;
    skippingRowId: string | null;
    tableModel: ReturnType<typeof buildTranslationTableModel>;
}) => {
    if (selectedRowIds.length === 0 || skippingRowId || !tableModel) {
        return;
    }

    setSkippingRowId('__bulk__');
    try {
        await updateBulkSkipState({
            content,
            filePath,
            router,
            selectedRowIdSet,
            setContent,
            setPendingEdits,
            setSelectedRowIds,
            skipped,
            tableModel,
        });
    } catch (error) {
        console.error('Failed to update skipped excerpt state in bulk', error);
    } finally {
        setSkippingRowId(null);
    }
};

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
        resetTranslationFileState({
            nextContent: fileData.content,
            setContent,
            setFixError,
            setIsCommitting,
            setIsFixingErrors,
            setPendingEdits,
            setSelectedRowIds,
            setSkippingRowId,
        });
    }, [fileData.content]);

    const conversation = useMemo(() => {
        try {
            return parseTranslationToCommon(content);
        } catch {
            return null;
        }
    }, [content]);
    const pendingEditCount = useMemo(() => Object.keys(pendingEdits).length, [pendingEdits]);
    const tableModel = useMemo(
        () => buildTranslationTableModel(conversation, pendingEdits, filePath),
        [conversation, filePath, pendingEdits],
    );
    const patchedConversation = useMemo(
        () => buildPatchedConversation(conversation, pendingEdits),
        [conversation, pendingEdits],
    );
    const fileName = filePath.split('/').at(-1) ?? 'file.json';
    const normalizedJsonViewValue = patchedConversation ?? conversation;
    const selectedRowIdSet = useMemo(() => new Set(selectedRowIds), [selectedRowIds]);

    useEffect(() => {
        setSelectedRowIds((currentIds) => syncSelectedRowIdsWithTableModel(currentIds, tableModel));
    }, [tableModel]);

    const handleDraftChange = (excerptId: string, originalText: string, nextText: string) => {
        setPendingEdits((currentEdits) => updatePendingEdits(currentEdits, excerptId, originalText, nextText));
    };

    const handleAutoFixErrors = () =>
        runAutoFixErrors({
            conversation,
            filePath,
            isFixingErrors,
            pendingEdits,
            setFixError,
            setIsFixingErrors,
            setPendingEdits,
            tableModel,
        });

    const handleViewChange = async (nextView: string) => {
        await navigate({
            params: { fileNameId: params.fileNameId },
            resetScroll: false,
            search: (previousSearch) => {
                const nextSearch = { ...previousSearch };

                if (nextView === 'table') {
                    delete nextSearch.view;
                } else {
                    nextSearch.view = nextView;
                }

                return nextSearch;
            },
            to: '/translations/$fileNameId',
        });
    };

    const handleCommitPending = () =>
        commitPendingTranslationEditsSafely({
            content,
            filePath,
            isCommitting,
            pendingEditCount,
            pendingEdits,
            router,
            setContent,
            setIsCommitting,
            setPendingEdits,
        });

    const handleFileDeleted = async () => {
        await deleteTranslationFile({ data: { relativePath: filePath } });
        await router.invalidate({ sync: true });
        await navigate({ search: pickBrowseFilters(search), to: '/' });
    };

    const handleToggleSkip = (excerptId: string, skipped: boolean) =>
        updateSingleSkipStateSafely({
            content,
            excerptId,
            filePath,
            router,
            setContent,
            setPendingEdits,
            setSelectedRowIds,
            setSkippingRowId,
            skipped,
            skippingRowId,
        });

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

    const handleBulkSetSkip = (skipped: boolean) =>
        updateBulkSkipStateSafely({
            content,
            filePath,
            router,
            selectedRowIdSet,
            selectedRowIds,
            setContent,
            setPendingEdits,
            setSelectedRowIds,
            setSkippingRowId,
            skipped,
            skippingRowId,
            tableModel,
        });

    return (
        <TranslationFileViewport
            content={content}
            fileName={fileName}
            fixError={fixError}
            isCommitting={isCommitting}
            isFixingErrors={isFixingErrors}
            normalizedJsonViewValue={normalizedJsonViewValue}
            onAutoFixErrors={() => void handleAutoFixErrors()}
            onBulkSetSkip={(skipped) => void handleBulkSetSkip(skipped)}
            onCommitPending={() => void handleCommitPending()}
            onDeleteFile={handleFileDeleted}
            onDraftChange={handleDraftChange}
            onToggleSelectAllRows={handleToggleSelectAllRows}
            onToggleSelectRow={handleToggleSelectRow}
            onToggleSkip={(excerptId, skipped) => void handleToggleSkip(excerptId, skipped)}
            onViewChange={(nextView) => void handleViewChange(nextView)}
            patchedConversation={patchedConversation}
            pendingEditCount={pendingEditCount}
            selectedRowIds={selectedRowIds}
            skippingRowId={skippingRowId}
            tableModel={tableModel}
            view={view}
        />
    );
}

import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router';
import { ChevronDown } from 'lucide-react';
import { startTransition, useEffect, useState } from 'react';
import { ConversationView } from '@/components/conversation-view';
import { DeleteButton } from '@/components/delete-button';
import { TranslationTableView } from '@/components/translations/translation-table-view';
import { getStoredAssistProvider } from '@/lib/assist-provider-storage';
import { parseTranslationRouteSearch, pickBrowseFilters } from '@/lib/browse-search';
import {
    commitTranslationPatch,
    deleteTranslationFile,
    fetchTranslationFileData,
    requestArabicLeakCorrections,
} from '@/lib/server-functions';
import type { TranslationFileResponse } from '@/lib/shell-types';
import {
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
    const [arabicLeakFixError, setArabicLeakFixError] = useState<string | null>(null);
    const [isFixingArabicLeaks, setIsFixingArabicLeaks] = useState(false);
    const [isCommitting, setIsCommitting] = useState(false);
    const view = isFileViewMode(search.view ?? null) ? (search.view ?? 'table') : 'table';
    const filePath = fileData.relativePath;

    useEffect(() => {
        setContent(fileData.content);
        setPendingEdits({});
        setArabicLeakFixError(null);
        setIsFixingArabicLeaks(false);
        setIsCommitting(false);
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

    const handleDraftChange = (excerptId: string, originalText: string, nextText: string) => {
        setPendingEdits((currentEdits) => updatePendingEdits(currentEdits, excerptId, originalText, nextText));
    };

    const handleAutoFixArabicLeaks = async () => {
        if (!tableModel || tableModel.arabicLeakExcerpts.length === 0 || isFixingArabicLeaks) {
            return;
        }

        setIsFixingArabicLeaks(true);
        setArabicLeakFixError(null);

        try {
            const response = await requestArabicLeakCorrections({
                data: {
                    excerpts: tableModel.arabicLeakExcerpts,
                    providerId: getStoredAssistProvider() ?? undefined,
                    scope: 'file',
                    task: 'arabic_leak_correction',
                },
            });
            const { issues, nextEdits, updatedRowCount } = applyArabicLeakCorrectionsToPendingEdits(
                tableModel,
                pendingEdits,
                response.corrections,
                response.patchMetadata,
                filePath,
            );

            if (updatedRowCount === 0) {
                setArabicLeakFixError(issues[0] ?? 'The assistant did not return any usable Arabic leak corrections.');
                return;
            }

            startTransition(() => {
                setPendingEdits(nextEdits);
                setArabicLeakFixError(issues[0] ?? null);
            });
        } catch (error) {
            setArabicLeakFixError(
                error instanceof Error ? error.message : 'Failed to request Arabic leak corrections.',
            );
        } finally {
            setIsFixingArabicLeaks(false);
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
                            <option value="json">JSON</option>
                            <option value="normal">Normal</option>
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

            <div className="flex-1 overflow-auto">
                {view === 'json' ? (
                    <pre className="h-full whitespace-pre-wrap break-words rounded-md bg-muted p-4 text-xs leading-5 [overflow-wrap:anywhere]">
                        {JSON.stringify(content, null, 2)}
                    </pre>
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
                        arabicLeakFixError={arabicLeakFixError}
                        isFixingArabicLeaks={isFixingArabicLeaks}
                        model={tableModel}
                        onAutoFixArabicLeaks={handleAutoFixArabicLeaks}
                        onDraftChange={handleDraftChange}
                    />
                )}
            </div>
        </div>
    );
}

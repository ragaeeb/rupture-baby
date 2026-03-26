'use client';

import { ChevronDown } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { startTransition, use, useEffect, useState } from 'react';
import { ConversationView } from '@/components/conversation-view';
import { DeleteButton } from '@/components/delete-button';
import { TranslationTableView } from '@/components/translations/translation-table-view';
import { fetchTranslationFile, updateTranslationFilePatch } from '@/lib/shell-api';
import type { TranslationFileResponse } from '@/lib/shell-types';
import {
    buildPatchedConversation,
    buildTranslationTableModel,
    getCommitButtonLabel,
    isFileViewMode,
    mergePersistedRuptureMeta,
    type PendingEditMap,
    updatePendingEdits,
} from '@/lib/translation-file-view-model';
import { parseTranslationToCommon } from '@/lib/translation-parser';

const fileCache = new Map<string, Promise<TranslationFileResponse>>();

const getFileData = (filePath: string) => {
    let promise = fileCache.get(filePath);
    if (!promise) {
        promise = fetchTranslationFile(filePath);
        fileCache.set(filePath, promise);
    }
    return promise;
};

const TranslationFileContent = ({ filePath }: { filePath: string }) => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const fileData = use(getFileData(filePath));
    const [content, setContent] = useState<unknown>(fileData.content);
    const [pendingEdits, setPendingEdits] = useState<PendingEditMap>({});
    const [isCommitting, setIsCommitting] = useState(false);
    const viewParam = searchParams.get('view');
    const view = isFileViewMode(viewParam) ? viewParam : 'table';

    useEffect(() => {
        setContent(fileData.content);
        setPendingEdits({});
        setIsCommitting(false);
    }, [fileData.content]);

    let conversation = null;
    try {
        conversation = parseTranslationToCommon(content);
    } catch {
        conversation = null;
    }

    const pendingEditCount = Object.keys(pendingEdits).length;
    const tableModel = buildTranslationTableModel(conversation, pendingEdits);
    const patchedConversation = buildPatchedConversation(conversation, pendingEdits);
    const fileName = filePath.split('/').at(-1) ?? 'file.json';

    const handleViewChange = (nextView: string) => {
        const nextSearchParams = new URLSearchParams(searchParams.toString());
        if (nextView === 'table') {
            nextSearchParams.delete('view');
        } else {
            nextSearchParams.set('view', nextView);
        }
        router.push(`?${nextSearchParams.toString()}`, { scroll: false });
    };

    const handleDraftChange = (excerptId: string, originalText: string, nextText: string) => {
        setPendingEdits((currentEdits) => updatePendingEdits(currentEdits, excerptId, originalText, nextText));
    };

    const handleCommitPending = async () => {
        if (pendingEditCount === 0 || isCommitting) {
            return;
        }

        setIsCommitting(true);
        try {
            let latestFile: TranslationFileResponse | null = null;

            for (const [excerptId, pendingEdit] of Object.entries(pendingEdits)) {
                latestFile = await updateTranslationFilePatch(filePath, excerptId, pendingEdit.patch);
            }

            if (latestFile) {
                const nextContent = mergePersistedRuptureMeta(content, latestFile.content);
                startTransition(() => {
                    setContent(nextContent);
                    setPendingEdits({});
                });
                fileCache.set(filePath, Promise.resolve({ ...latestFile, content: nextContent }));
            }
        } catch (error) {
            console.error('Failed to commit translation patches', error);
        } finally {
            setIsCommitting(false);
        }
    };

    const handleFileDeleted = () => {
        fileCache.delete(filePath);
        router.push('/');
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
                            onChange={(event) => handleViewChange(event.target.value)}
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
                <DeleteButton fileName={fileName} filePath={filePath} onSuccess={handleFileDeleted} />
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
                    <TranslationTableView model={tableModel} onDraftChange={handleDraftChange} />
                )}
            </div>
        </div>
    );
};

const TranslationFilePage = () => {
    const params = useParams<{ fileNameId: string }>();

    if (!params.fileNameId) {
        return (
            <div className="flex h-full min-h-0 flex-col items-center justify-center">
                <p className="text-muted-foreground text-sm">Select a JSON file from the sidebar.</p>
            </div>
        );
    }

    try {
        return <TranslationFileContent filePath={decodeURIComponent(params.fileNameId)} />;
    } catch {
        return (
            <div className="flex h-full min-h-0 flex-col items-center justify-center">
                <p className="text-destructive text-sm">Invalid file path.</p>
            </div>
        );
    }
};

export default TranslationFilePage;

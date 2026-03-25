'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { use } from 'react';
import { ConversationView } from '@/components/conversation-view';
import { Switch } from '@/components/ui/switch';
import { ValidateDialog } from '@/components/validate-dialog';
import { fetchTranslationFile } from '@/lib/shell-api';
import { parseTranslationToCommon } from '@/lib/translation-parser';
import type { CommonConversationExport } from '@/lib/translation-types';

// Promise cache to ensure each file is only fetched once
const fileCache = new Map<string, Promise<unknown>>();

const getFileData = (filePath: string) => {
    let promise = fileCache.get(filePath);
    if (!promise) {
        promise = fetchTranslationFile(filePath);
        fileCache.set(filePath, promise);
    }
    return promise;
};

const CommonView = ({
    conversation,
    onParsed,
}: {
    conversation: CommonConversationExport | null;
    onParsed: (parsed: CommonConversationExport) => void;
}) => {
    if (!conversation) {
        return (
            <div className="flex h-full min-h-0 flex-col items-center justify-center">
                <p className="text-muted-foreground text-sm">Failed to parse conversation.</p>
            </div>
        );
    }

    onParsed(conversation);
    return <ConversationView conversation={conversation} />;
};

const TranslationFileContent = ({ filePath }: { filePath: string }) => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const fileData = use(getFileData(filePath));
    const content = (fileData as { content: unknown }).content;

    const showRaw = searchParams.get('view') === 'raw';

    const handleViewChange = (checked: boolean) => {
        const newParams = new URLSearchParams(searchParams.toString());
        newParams.set('view', checked ? 'raw' : 'common');
        router.push(`?${newParams.toString()}`, { scroll: false });
    };

    let parsedConversation: CommonConversationExport | null = null;
    try {
        parsedConversation = parseTranslationToCommon(content);
    } catch {
        // Will be handled by CommonView
    }

    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="flex items-center justify-end gap-2">
                {parsedConversation && <ValidateDialog conversation={parsedConversation} />}
                <span className="text-muted-foreground text-sm">Raw</span>
                <Switch checked={showRaw} onCheckedChange={handleViewChange} />
            </div>

            <div className="flex-1 overflow-auto">
                {showRaw ? (
                    <pre className="h-full whitespace-pre-wrap break-words rounded-md bg-muted p-4 text-xs leading-5 [overflow-wrap:anywhere]">
                        {JSON.stringify(content, null, 2)}
                    </pre>
                ) : (
                    <CommonView conversation={parsedConversation} onParsed={() => {}} />
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

    let selectedFilePath: string;
    try {
        selectedFilePath = decodeURIComponent(params.fileNameId);
    } catch {
        return (
            <div className="flex h-full min-h-0 flex-col items-center justify-center">
                <p className="text-destructive text-sm">Invalid file path.</p>
            </div>
        );
    }

    return <TranslationFileContent filePath={selectedFilePath} />;
};

export default TranslationFilePage;

'use client';

import { useParams } from 'next/navigation';
import { use } from 'react';
import { fetchTranslationFile } from '@/lib/shell-api';

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

const TranslationFileContent = ({ filePath }: { filePath: string }) => {
    const fileData = use(getFileData(filePath));
    const content = (fileData as { content: unknown }).content;
    const prettyJson = JSON.stringify(content, null, 2);

    return (
        <pre className="h-full max-w-full overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-4 text-xs leading-5 [overflow-wrap:anywhere]">
            {prettyJson}
        </pre>
    );
};

const TranslationFilePage = () => {
    const params = useParams<{ fileNameId: string }>();

    if (!params.fileNameId) {
        return (
            <div className="flex min-h-0 flex-1 flex-col rounded-xl border bg-card p-4">
                <p className="text-muted-foreground text-sm">Select a JSON file from the sidebar.</p>
            </div>
        );
    }

    let selectedFilePath: string;
    try {
        selectedFilePath = decodeURIComponent(params.fileNameId);
    } catch {
        return (
            <div className="flex min-h-0 flex-1 flex-col rounded-xl border bg-card p-4">
                <p className="text-destructive text-sm">Invalid file path.</p>
            </div>
        );
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col rounded-xl border bg-card p-4">
            <TranslationFileContent filePath={selectedFilePath} />
        </div>
    );
};

export default TranslationFilePage;

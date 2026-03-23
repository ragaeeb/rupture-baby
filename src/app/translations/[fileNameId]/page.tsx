'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { use, useState } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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

type ViewMode = 'raw' | 'common';

const CommonView = ({ content }: { content: unknown }) => {
    const parsed = parseTranslationToCommon(content);

    if (parsed.length === 0) {
        return (
            <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4">
                <p className="text-muted-foreground text-sm">No conversations found in this file.</p>
            </div>
        );
    }

    if (parsed.length === 1) {
        const item = parsed[0];
        return <SingleConversationView conversation={item} />;
    }

    return <MultiConversationView conversations={parsed} />;
};

const formatTimestamp = (isoString: string): string => {
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = date.toLocaleString('en-US', { month: 'short' });
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${month} ${day}, ${year} ${hours12}:${minutes} ${ampm}`;
};

const SingleConversationView = ({ conversation }: { conversation: CommonConversationExport }) => {
    return (
        <div className="flex h-full min-h-0 flex-col gap-4">
            <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-sm">Platform:</span>
                    <Badge variant="default">{conversation.llm}</Badge>
                </div>
                {conversation.model && (
                    <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-sm">Model:</span>
                        <Badge variant="secondary">{conversation.model}</Badge>
                    </div>
                )}
                {conversation.created_at && (
                    <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-sm">Created:</span>
                        <span className="text-sm">{formatTimestamp(conversation.created_at)}</span>
                    </div>
                )}
                {conversation.updated_at && (
                    <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-sm">Updated:</span>
                        <span className="text-sm">{formatTimestamp(conversation.updated_at)}</span>
                    </div>
                )}
            </div>

            {conversation.title && (
                <div>
                    <h3 className="font-semibold text-lg">{conversation.title}</h3>
                </div>
            )}

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
                <Accordion type="multiple" defaultValue={['response']} className="w-full">
                    <AccordionItem value="prompt">
                        <AccordionTrigger>Prompt</AccordionTrigger>
                        <AccordionContent>
                            <div className="rounded-lg border bg-card p-4">
                                <p className="whitespace-pre-wrap text-sm">{conversation.prompt || '—'}</p>
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                    {conversation.reasoning.length > 0 && (
                        <AccordionItem value="reasoning">
                            <AccordionTrigger>Reasoning ({conversation.reasoning.length} steps)</AccordionTrigger>
                            <AccordionContent>
                                <div className="rounded-lg border bg-card p-4">
                                    <ol className="list-decimal space-y-2 pl-4">
                                        {conversation.reasoning.map((step, index) => (
                                            <li key={index} className="whitespace-pre-wrap text-sm">
                                                {step}
                                            </li>
                                        ))}
                                    </ol>
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    )}
                    <AccordionItem value="response">
                        <AccordionTrigger>Response</AccordionTrigger>
                        <AccordionContent>
                            <div className="rounded-lg border bg-card p-4">
                                <p className="whitespace-pre-wrap text-sm">{conversation.response || '—'}</p>
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </div>
        </div>
    );
};

const MultiConversationView = ({ conversations }: { conversations: CommonConversationExport[] }) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    return (
        <div className="flex h-full min-h-0 flex-col gap-4">
            <div className="flex items-center gap-2 border-b pb-2">
                <span className="text-muted-foreground text-sm">Conversations:</span>
                <div className="flex flex-wrap gap-2">
                    {conversations.map((conv, index) => (
                        <button
                            key={conv.conversation_id || index}
                            type="button"
                            className={`rounded border px-2 py-1 text-xs ${
                                index === selectedIndex
                                    ? 'border-blue-500 bg-blue-100'
                                    : 'border-neutral-300 bg-white hover:bg-neutral-50'
                            }`}
                            onClick={() => setSelectedIndex(index)}
                        >
                            {conv.title?.slice(0, 30) || `#${index + 1}`}
                        </button>
                    ))}
                </div>
            </div>

            <SingleConversationView conversation={conversations[selectedIndex]} />
        </div>
    );
};

const TranslationFileContent = ({ filePath }: { filePath: string }) => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const fileData = use(getFileData(filePath));
    const content = (fileData as { content: unknown }).content;

    const viewMode = (searchParams.get('view') === 'common' ? 'common' : 'raw') as ViewMode;

    const handleViewChange = (checked: boolean) => {
        const newParams = new URLSearchParams(searchParams.toString());
        newParams.set('view', checked ? 'common' : 'raw');
        router.push(`?${newParams.toString()}`, { scroll: false });
    };

    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="flex items-center justify-end">
                <div className="flex items-center gap-2">
                    <span
                        className={`text-sm ${viewMode === 'raw' ? 'font-medium text-foreground' : 'text-muted-foreground'}`}
                    >
                        Raw
                    </span>
                    <Switch checked={viewMode === 'common'} onCheckedChange={handleViewChange} />
                    <span
                        className={`text-sm ${viewMode === 'common' ? 'font-medium text-foreground' : 'text-muted-foreground'}`}
                    >
                        Common
                    </span>
                </div>
            </div>

            <div className="flex-1 overflow-auto">
                {viewMode === 'raw' ? (
                    <pre className="h-full whitespace-pre-wrap break-words rounded-md bg-muted p-4 text-xs leading-5 [overflow-wrap:anywhere]">
                        {JSON.stringify(content, null, 2)}
                    </pre>
                ) : (
                    <CommonView content={content} />
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

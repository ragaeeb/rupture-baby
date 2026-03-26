'use client';

import { ChevronDown } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, use } from 'react';
import { ConversationView } from '@/components/conversation-view';
import { DeleteButton } from '@/components/delete-button';
import { fetchTranslationFile } from '@/lib/shell-api';
import { parseTranslationToCommon, validateConversationExcerpts } from '@/lib/translation-parser';
import type { CommonConversationExport } from '@/lib/translation-types';
import type { ValidationError } from '@/lib/validation/types';

// Promise cache to ensure each file is only fetched once
const fileCache = new Map<string, Promise<unknown>>();

type FileViewMode = 'table' | 'json' | 'normal';

const isFileViewMode = (value: string | null): value is FileViewMode =>
    value === 'table' || value === 'json' || value === 'normal';

const getFileData = (filePath: string) => {
    let promise = fileCache.get(filePath);
    if (!promise) {
        promise = fetchTranslationFile(filePath);
        fileCache.set(filePath, promise);
    }
    return promise;
};

type TextRange = { end: number; start: number };

const mergeRanges = (ranges: TextRange[]) => {
    if (ranges.length === 0) {
        return [];
    }

    const sorted = [...ranges].sort((left, right) => left.start - right.start || left.end - right.end);
    const merged: TextRange[] = [{ ...sorted[0] }];

    for (let i = 1; i < sorted.length; i += 1) {
        const current = sorted[i];
        const previous = merged[merged.length - 1];

        if (current.start <= previous.end) {
            previous.end = Math.max(previous.end, current.end);
            continue;
        }

        merged.push({ ...current });
    }

    return merged;
};

const renderHighlightedText = (text: string, highlightRanges: TextRange[]): ReactNode => {
    const mergedRanges = mergeRanges(highlightRanges).filter((range) => range.start < range.end);

    if (mergedRanges.length === 0) {
        return text;
    }

    const nodes: ReactNode[] = [];
    let cursor = 0;

    for (const range of mergedRanges) {
        if (range.start > cursor) {
            nodes.push(text.slice(cursor, range.start));
        }

        nodes.push(
            <span
                key={`${range.start}-${range.end}-${text.slice(range.start, range.end)}`}
                className="rounded-sm bg-destructive/15 px-0.5 font-semibold text-destructive ring-1 ring-destructive/30 ring-inset"
            >
                {text.slice(range.start, range.end)}
            </span>,
        );
        cursor = range.end;
    }

    if (cursor < text.length) {
        nodes.push(text.slice(cursor));
    }

    return nodes;
};

const TableView = ({ conversation }: { conversation: CommonConversationExport | null }) => {
    if (!conversation) {
        return (
            <div className="flex h-full min-h-0 flex-col items-center justify-center">
                <p className="text-muted-foreground text-sm">Failed to parse conversation.</p>
            </div>
        );
    }

    const validation = validateConversationExcerpts(conversation);
    const { arabicSegments, excerpts, translatedSegments, validationErrors } = validation;
    const isValid = validationErrors.length === 0;
    const hasAlignmentErrors = validationErrors.some((error) =>
        ['duplicate_id', 'invented_id', 'missing_id_gap'].includes(error.type),
    );
    const responseLength = conversation.response.length;
    const translatedById = new Map(translatedSegments.map((segment) => [segment.id, segment.text]));
    const errorsById = new Map<string, ValidationError[]>();

    for (const error of validationErrors) {
        if (!error.id) {
            continue;
        }

        const existing = errorsById.get(error.id) ?? [];
        existing.push(error);
        errorsById.set(error.id, existing);
    }

    const tableRows = arabicSegments.map((segment, index) => {
        const excerpt = excerpts[index];
        const translatedText = excerpt?.text ?? translatedById.get(segment.id) ?? '';
        const rowErrors = errorsById.get(segment.id) ?? [];
        const highlightRanges = rowErrors
            .filter((error) => error.range.start !== 0 || error.range.end !== responseLength)
            .flatMap((error) => {
                const matchText = error.matchText.trim();
                if (!matchText) {
                    return [];
                }

                const start = translatedText.indexOf(matchText);
                if (start === -1) {
                    return [];
                }

                return [{ end: start + matchText.length, start }];
            });

        return {
            arabic: segment.text,
            highlightRanges,
            id: segment.id,
            translatedText,
            validationMessages: rowErrors.map((error) => error.message),
        };
    });

    return (
        <div className="flex h-full min-h-0 flex-col gap-4">
            {!isValid ? (
                <div className="rounded-md border border-destructive/20 bg-destructive/5 p-4 text-sm">
                    {hasAlignmentErrors ? (
                        <>
                            <p className="font-medium text-destructive">
                                The translated response does not match the source excerpts.
                            </p>
                            <p className="mt-1 text-muted-foreground">
                                Source IDs: {arabicSegments.map((segment) => segment.id).join(', ') || 'None'}
                            </p>
                            <p className="mt-1 text-muted-foreground">
                                Response IDs: {translatedSegments.map((segment) => segment.id).join(', ') || 'None'}
                            </p>
                        </>
                    ) : (
                        <p className="font-medium text-destructive">
                            The translated response has content validation issues, but its segment IDs still match the
                            source.
                        </p>
                    )}
                </div>
            ) : null}

            <div className="flex-1 overflow-auto rounded-md border">
                <table className="w-full">
                    <thead className="sticky top-0 bg-background">
                        <tr className="border-b">
                            <th className="w-16 px-4 py-2 text-left font-medium text-xs">ID</th>
                            <th className="w-1/2 px-4 py-2 text-left font-medium">Arabic</th>
                            <th className="w-1/2 px-4 py-2 text-left font-medium text-xs">Translation</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tableRows.map((row) => (
                            <tr
                                key={row.id}
                                className={
                                    row.validationMessages.length > 0
                                        ? 'border-b bg-destructive/5 shadow-[inset_0_0_0_1px_hsl(var(--destructive)/0.35)] last:border-b-0'
                                        : 'border-b last:border-b-0'
                                }
                            >
                                <td
                                    className={
                                        row.validationMessages.length > 0
                                            ? 'px-4 py-3 align-top font-mono font-semibold text-[10px] text-destructive'
                                            : 'px-4 py-3 align-top font-mono text-[10px] text-muted-foreground'
                                    }
                                >
                                    {row.id}
                                </td>
                                <td className="whitespace-pre-wrap px-4 py-3 align-top text-sm" dir="rtl">
                                    {row.arabic}
                                </td>
                                <td className="px-4 py-3 align-top text-[10px]">
                                    <div
                                        className={
                                            row.validationMessages.length > 0
                                                ? 'whitespace-pre-wrap rounded border border-destructive/30 bg-background px-3 py-2 font-medium text-destructive shadow-sm'
                                                : 'whitespace-pre-wrap'
                                        }
                                    >
                                        {row.translatedText
                                            ? renderHighlightedText(row.translatedText, row.highlightRanges)
                                            : '—'}
                                    </div>
                                    {row.validationMessages.length > 0 ? (
                                        <div className="mt-2 space-y-1 rounded border border-destructive/20 bg-destructive/5 px-3 py-2">
                                            {row.validationMessages.map((message) => (
                                                <p
                                                    key={`${row.id}-${message}`}
                                                    className="font-medium text-destructive text-xs"
                                                >
                                                    {message}
                                                </p>
                                            ))}
                                        </div>
                                    ) : null}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const TranslationFileContent = ({ filePath }: { filePath: string }) => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const fileData = use(getFileData(filePath));
    const content = (fileData as { content: unknown }).content;
    const viewParam = searchParams.get('view');
    const view = isFileViewMode(viewParam) ? viewParam : 'table';

    const handleViewChange = (nextView: string) => {
        const newParams = new URLSearchParams(searchParams.toString());
        if (nextView === 'table') {
            newParams.delete('view');
        } else {
            newParams.set('view', nextView);
        }
        router.push(`?${newParams.toString()}`, { scroll: false });
    };

    const handleFileDeleted = () => {
        // Clear cache for deleted file
        fileCache.delete(filePath);
        // Navigate to dashboard
        router.push('/dashboard');
    };

    const fileName = filePath.split('/').pop() || 'file.json';

    let parsedConversation: CommonConversationExport | null = null;
    try {
        parsedConversation = parseTranslationToCommon(content);
    } catch {
        // Will be handled by CommonView
    }

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
                <DeleteButton fileName={fileName} filePath={filePath} onSuccess={handleFileDeleted} />
            </div>

            <div className="flex-1 overflow-auto">
                {view === 'json' ? (
                    <pre className="h-full whitespace-pre-wrap break-words rounded-md bg-muted p-4 text-xs leading-5 [overflow-wrap:anywhere]">
                        {JSON.stringify(content, null, 2)}
                    </pre>
                ) : view === 'normal' ? (
                    parsedConversation ? (
                        <ConversationView conversation={parsedConversation} />
                    ) : (
                        <div className="flex h-full min-h-0 flex-col items-center justify-center">
                            <p className="text-muted-foreground text-sm">Failed to parse conversation.</p>
                        </div>
                    )
                ) : (
                    <TableView conversation={parsedConversation} />
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

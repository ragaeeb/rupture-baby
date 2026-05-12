'use client';

import { useNavigate } from '@tanstack/react-router';
import { Copy, Download, FileArchive, FileJson } from 'lucide-react';
import { startTransition, useEffect, useMemo, useState } from 'react';

import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { type CompilationExportRouteSearch, sanitizeSearch } from '@/lib/browse-search';
import {
    COMPILATION_EXPORT_PROVIDER_OPTIONS,
    type CompilationExportProviderId,
    DEFAULT_COMPILATION_EXPORT_CONTEXT_WINDOW_TOKENS,
    DEFAULT_COMPILATION_EXPORT_PROVIDER,
    DEFAULT_COMPILATION_EXPORT_RESERVED_TOKENS,
} from '@/lib/compilation-export-shared';
import { getErrorMessage } from '@/lib/error-utils';
import type { CompilationExportPageData } from '@/lib/shell-types';

type CompilationExportPageProps = { data: CompilationExportPageData; search: CompilationExportRouteSearch };

const buildNextSearch = ({
    contextWindowTokens,
    provider,
    reservedTokens,
    search,
}: {
    contextWindowTokens: number;
    provider: CompilationExportProviderId;
    reservedTokens: number;
    search: CompilationExportRouteSearch;
}) =>
    sanitizeSearch({
        ...search,
        contextWindowTokens:
            contextWindowTokens === DEFAULT_COMPILATION_EXPORT_CONTEXT_WINDOW_TOKENS ? undefined : contextWindowTokens,
        provider: provider === DEFAULT_COMPILATION_EXPORT_PROVIDER ? undefined : provider,
        reservedTokens: reservedTokens === DEFAULT_COMPILATION_EXPORT_RESERVED_TOKENS ? undefined : reservedTokens,
    });

const getProviderDescription = (provider: CompilationExportProviderId) =>
    COMPILATION_EXPORT_PROVIDER_OPTIONS.find((option) => option.id === provider)?.description ?? null;

const CompilationExportPage = ({ data, search }: CompilationExportPageProps) => {
    const navigate = useNavigate();
    const [contextWindowInput, setContextWindowInput] = useState(
        String(search.contextWindowTokens ?? DEFAULT_COMPILATION_EXPORT_CONTEXT_WINDOW_TOKENS),
    );
    const [provider, setProvider] = useState<CompilationExportProviderId>(
        search.provider ?? DEFAULT_COMPILATION_EXPORT_PROVIDER,
    );
    const [reservedTokensInput, setReservedTokensInput] = useState(
        String(search.reservedTokens ?? DEFAULT_COMPILATION_EXPORT_RESERVED_TOKENS),
    );
    const [copyError, setCopyError] = useState<string | null>(null);
    const [copySuccess, setCopySuccess] = useState<string | null>(null);

    useEffect(() => {
        setContextWindowInput(String(search.contextWindowTokens ?? DEFAULT_COMPILATION_EXPORT_CONTEXT_WINDOW_TOKENS));
        setProvider(search.provider ?? DEFAULT_COMPILATION_EXPORT_PROVIDER);
        setReservedTokensInput(String(search.reservedTokens ?? DEFAULT_COMPILATION_EXPORT_RESERVED_TOKENS));
    }, [search.contextWindowTokens, search.provider, search.reservedTokens]);

    const providerDescription = useMemo(() => getProviderDescription(provider), [provider]);
    const plan = data.plan;

    const handleApply = () => {
        const parsedContextWindowTokens = Number.parseInt(contextWindowInput, 10);
        const parsedReservedTokens = Number.parseInt(reservedTokensInput, 10);

        void navigate({
            replace: false,
            search: buildNextSearch({
                contextWindowTokens: Number.isFinite(parsedContextWindowTokens)
                    ? parsedContextWindowTokens
                    : DEFAULT_COMPILATION_EXPORT_CONTEXT_WINDOW_TOKENS,
                provider,
                reservedTokens: Number.isFinite(parsedReservedTokens)
                    ? parsedReservedTokens
                    : DEFAULT_COMPILATION_EXPORT_RESERVED_TOKENS,
                search,
            }),
            to: '/exports',
        });
    };

    const handleReset = () => {
        startTransition(() => {
            setContextWindowInput(String(DEFAULT_COMPILATION_EXPORT_CONTEXT_WINDOW_TOKENS));
            setProvider(DEFAULT_COMPILATION_EXPORT_PROVIDER);
            setReservedTokensInput(String(DEFAULT_COMPILATION_EXPORT_RESERVED_TOKENS));
        });

        void navigate({ replace: false, search: sanitizeSearch({}), to: '/exports' });
    };

    const handleCopyPrompt = async () => {
        if (!plan?.prompt) {
            return;
        }

        try {
            await navigator.clipboard.writeText(plan.prompt);
            setCopyError(null);
            setCopySuccess('Prompt copied to clipboard.');
            setTimeout(() => setCopySuccess(null), 3000);
        } catch (error) {
            setCopySuccess(null);
            setCopyError(getErrorMessage(error, 'Failed to copy the prompt.'));
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
                            <BreadcrumbPage>Exports</BreadcrumbPage>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>
            </header>

            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="rounded-xl border bg-card p-4">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <h2 className="font-semibold text-lg">Compilation Export</h2>
                            <p className="mt-1 max-w-3xl text-muted-foreground text-sm">
                                Build attachment-sized JSON chunks that keep only excerpt and heading IDs plus Arabic
                                text. Attach a chunk JSON alongside the prompt, or download a zip when your LLM client
                                can inspect archives or call unzip/file tools.
                            </p>
                        </div>

                        {plan ? (
                            <div className="flex flex-wrap gap-2">
                                <Button onClick={handleCopyPrompt} type="button" variant="outline">
                                    <Copy />
                                    Copy Prompt
                                </Button>
                                <Button asChild variant="outline">
                                    <a href={plan.promptDownloadUrl}>
                                        <Download />
                                        Prompt TXT
                                    </a>
                                </Button>
                                <Button asChild variant="outline">
                                    <a href={plan.manifestDownloadUrl}>
                                        <FileJson />
                                        Manifest JSON
                                    </a>
                                </Button>
                                <Button asChild>
                                    <a href={plan.zipDownloadUrl}>
                                        <FileArchive />
                                        Download ZIP
                                    </a>
                                </Button>
                            </div>
                        ) : null}
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-3">
                        <label className="space-y-2">
                            <span className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                                Tokenizer
                            </span>
                            <select
                                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                onChange={(event) => setProvider(event.target.value as CompilationExportProviderId)}
                                value={provider}
                            >
                                {COMPILATION_EXPORT_PROVIDER_OPTIONS.map((option) => (
                                    <option key={option.id} value={option.id}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="space-y-2">
                            <span className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                                Context Window Tokens
                            </span>
                            <input
                                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                min={1}
                                onChange={(event) => setContextWindowInput(event.target.value)}
                                type="number"
                                value={contextWindowInput}
                            />
                        </label>

                        <label className="space-y-2">
                            <span className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                                Reserved Tokens
                            </span>
                            <input
                                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                min={0}
                                onChange={(event) => setReservedTokensInput(event.target.value)}
                                type="number"
                                value={reservedTokensInput}
                            />
                        </label>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Button onClick={handleApply} type="button">
                            Rebuild Plan
                        </Button>
                        <Button onClick={handleReset} type="button" variant="outline">
                            Reset
                        </Button>
                    </div>

                    {providerDescription ? (
                        <p className="mt-3 text-muted-foreground text-xs">{providerDescription}</p>
                    ) : null}
                    {copySuccess ? <p className="mt-3 text-green-700 text-sm">{copySuccess}</p> : null}
                    {copyError ? <p className="mt-3 text-destructive text-sm">{copyError}</p> : null}
                    {data.error ? <p className="mt-3 text-destructive text-sm">{data.error}</p> : null}
                </div>

                {plan ? (
                    <>
                        <div className="grid gap-4 md:grid-cols-4">
                            <div className="rounded-xl border bg-muted/20 p-4">
                                <p className="text-muted-foreground text-xs">Chunks</p>
                                <p className="mt-1 font-semibold text-2xl">{plan.chunkCount.toLocaleString()}</p>
                            </div>
                            <div className="rounded-xl border bg-muted/20 p-4">
                                <p className="text-muted-foreground text-xs">Items</p>
                                <p className="mt-1 font-semibold text-2xl">{plan.totalItemCount.toLocaleString()}</p>
                                <p className="mt-1 text-muted-foreground text-xs">
                                    {plan.excerptCount.toLocaleString()} excerpts, {plan.headingCount.toLocaleString()}{' '}
                                    headings
                                </p>
                            </div>
                            <div className="rounded-xl border bg-muted/20 p-4">
                                <p className="text-muted-foreground text-xs">Prompt Tokens</p>
                                <p className="mt-1 font-semibold text-2xl">{plan.promptTokens.toLocaleString()}</p>
                            </div>
                            <div className="rounded-xl border bg-muted/20 p-4">
                                <p className="text-muted-foreground text-xs">Usable Tokens Per Chunk</p>
                                <p className="mt-1 font-semibold text-2xl">
                                    {plan.availableChunkTokens.toLocaleString()}
                                </p>
                            </div>
                        </div>

                        <div className="rounded-xl border bg-card p-4">
                            <h3 className="font-semibold text-base">Prompt</h3>
                            <p className="mt-1 text-muted-foreground text-sm">
                                Send this prompt together with one chunk JSON attachment at a time.
                            </p>
                            <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-4 text-xs leading-5">
                                {plan.prompt || 'No prompt is currently stored in the compilation file.'}
                            </pre>
                        </div>

                        <div className="rounded-xl border bg-card p-4">
                            <h3 className="font-semibold text-base">Chunk Files</h3>
                            <p className="mt-1 text-muted-foreground text-sm">
                                Each chunk JSON keeps only <code>id</code> and <code>nass</code> in separate{' '}
                                <code>excerpts</code> and <code>headings</code> arrays.
                            </p>

                            <div className="mt-4 overflow-x-auto">
                                <table className="min-w-full divide-y divide-border text-sm">
                                    <thead>
                                        <tr className="text-left text-muted-foreground">
                                            <th className="px-3 py-2 font-medium">Chunk</th>
                                            <th className="px-3 py-2 font-medium">Items</th>
                                            <th className="px-3 py-2 font-medium">Estimated Tokens</th>
                                            <th className="px-3 py-2 font-medium">Range</th>
                                            <th className="px-3 py-2 font-medium">File</th>
                                            <th className="px-3 py-2 font-medium">Download</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {plan.chunks.map((chunk) => (
                                            <tr key={chunk.chunkIndex}>
                                                <td className="px-3 py-3 font-medium">{chunk.chunkIndex}</td>
                                                <td className="px-3 py-3">
                                                    <div>{chunk.itemCount.toLocaleString()} total</div>
                                                    <div className="text-muted-foreground text-xs">
                                                        {chunk.excerptCount.toLocaleString()} excerpts,{' '}
                                                        {chunk.headingCount.toLocaleString()} headings
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3">{chunk.estimatedTokens.toLocaleString()}</td>
                                                <td className="px-3 py-3 text-muted-foreground text-xs">
                                                    {chunk.firstId && chunk.lastId
                                                        ? `${chunk.firstId} -> ${chunk.lastId}`
                                                        : '—'}
                                                </td>
                                                <td className="px-3 py-3 font-mono text-xs">{chunk.filename}</td>
                                                <td className="px-3 py-3">
                                                    <Button asChild size="sm" variant="outline">
                                                        <a href={chunk.downloadUrl}>
                                                            <Download />
                                                            JSON
                                                        </a>
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                ) : null}
            </div>
        </>
    );
};

export default CompilationExportPage;

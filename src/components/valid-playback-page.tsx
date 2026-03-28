'use client';

import { Link } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';

import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { saveCompilationPlaybackData } from '@/lib/server-functions';
import type { CompilationPlaybackSimulationResponse } from '@/lib/shell-types';

type ValidPlaybackPageProps = { data: CompilationPlaybackSimulationResponse };
type ExcerptIssueRow = { filePaths: string[]; id: string };
type CompilationTargetIssueRow = {
    id: string;
    targets: Array<{ collection: 'excerpts' | 'footnotes' | 'headings'; index: number }>;
};

const getLocalFileHref = (filePath: string) => `file://${encodeURI(filePath)}`;

const TranslationFileLink = ({ filePath }: { filePath: string }) => (
    <Link
        className="text-primary underline-offset-4 hover:underline"
        params={{ fileNameId: filePath }}
        to="/translations/$fileNameId"
    >
        {filePath}
    </Link>
);

const CompilationFileLink = ({ filePath }: { filePath: string }) => (
    <a
        className="text-primary underline-offset-4 hover:underline"
        href={getLocalFileHref(filePath)}
        rel="noreferrer"
        target="_blank"
    >
        {filePath}
    </a>
);

const ScrollList = ({ children }: { children: ReactNode }) => (
    <div className="mt-3 max-h-48 overflow-auto rounded-lg border bg-muted/20 p-3">{children}</div>
);

const CollapsibleReportCard = ({
    children,
    countLabel,
    defaultOpen = false,
    title,
}: {
    children: ReactNode;
    countLabel: string;
    defaultOpen?: boolean;
    title: string;
}) => (
    <div className="rounded-xl border bg-card p-4">
        <div>
            <h2 className="font-semibold text-base">{title}</h2>
            <p className="mt-1 text-muted-foreground text-sm">{countLabel}</p>
        </div>
        <details className="mt-3" open={defaultOpen}>
            <summary className="cursor-pointer text-primary text-sm underline-offset-4 hover:underline">
                Show details
            </summary>
            <ScrollList>{children}</ScrollList>
        </details>
    </div>
);

const renderPlayedFileList = (items: string[]) => {
    if (items.length === 0) {
        return <p className="text-muted-foreground text-sm">None</p>;
    }

    return (
        <ul className="space-y-2 text-sm">
            {items.map((item) => (
                <li key={item} className="break-all">
                    <TranslationFileLink filePath={item} />
                </li>
            ))}
        </ul>
    );
};

const ExcerptIssueTable = ({ items }: { items: ExcerptIssueRow[] }) => {
    if (items.length === 0) {
        return <p className="text-muted-foreground text-sm">None</p>;
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-sm">
                <thead>
                    <tr className="border-b text-left">
                        <th className="px-2 py-2 font-medium">ID</th>
                        <th className="px-2 py-2 font-medium">Source Translation Files</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item) => (
                        <tr key={item.id} className="border-b align-top last:border-b-0">
                            <td className="px-2 py-2 font-medium">{item.id}</td>
                            <td className="px-2 py-2">
                                <div className="flex flex-col gap-1">
                                    {item.filePaths.map((filePath) => (
                                        <span key={filePath} className="break-all">
                                            <TranslationFileLink filePath={filePath} />
                                        </span>
                                    ))}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const CompilationTargetIssueTable = ({
    compilationFilePath,
    items,
}: {
    compilationFilePath: string;
    items: CompilationTargetIssueRow[];
}) => {
    if (items.length === 0) {
        return <p className="text-muted-foreground text-sm">None</p>;
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] border-collapse text-sm">
                <thead>
                    <tr className="border-b text-left">
                        <th className="px-2 py-2 font-medium">ID</th>
                        <th className="px-2 py-2 font-medium">Compilation Targets</th>
                        <th className="px-2 py-2 font-medium">Compilation JSON</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item) => (
                        <tr key={item.id} className="border-b align-top last:border-b-0">
                            <td className="px-2 py-2 font-medium">{item.id}</td>
                            <td className="px-2 py-2">
                                <div className="flex flex-col gap-1">
                                    {item.targets.map((target) => (
                                        <span key={`${item.id}-${target.collection}-${target.index}`}>
                                            {target.collection}[{target.index}]
                                        </span>
                                    ))}
                                </div>
                            </td>
                            <td className="break-all px-2 py-2">
                                <CompilationFileLink filePath={compilationFilePath} />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const ValidPlaybackPage = ({ data }: ValidPlaybackPageProps) => {
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [savedOutputPath, setSavedOutputPath] = useState<string | null>(null);

    const handleSavePlayback = async () => {
        if (isSaving || data.blockedByCompilationDuplicates) {
            return;
        }

        setIsSaving(true);
        setSaveError(null);

        try {
            const response = await saveCompilationPlaybackData();
            setSavedOutputPath(response.outputPath);
        } catch (error) {
            setSaveError(error instanceof Error ? error.message : 'Failed to save played compilation.');
        } finally {
            setIsSaving(false);
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
                            <BreadcrumbPage>Valid Playback Simulation</BreadcrumbPage>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>
            </header>

            <div className="flex flex-1 flex-col gap-4 p-4">
                {data.blockedByCompilationDuplicates ? (
                    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                        <h2 className="font-semibold text-base text-destructive">Playback Blocked</h2>
                        <p className="mt-2 text-muted-foreground text-sm">
                            The compilation contains IDs that appear in more than one target collection. That violates
                            the uniqueness rule, so playback is blocked until the data is fixed.
                        </p>
                    </div>
                ) : null}

                <div className="rounded-xl border bg-card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <h2 className="font-semibold text-base">Simulation Summary</h2>
                            <p className="mt-2 text-muted-foreground text-sm">
                                This updates the compilation in memory only. The original compilation file is not
                                modified.
                            </p>
                            {saveError ? <p className="mt-2 text-destructive text-xs">{saveError}</p> : null}
                            {savedOutputPath ? (
                                <p className="mt-2 text-green-700 text-xs">
                                    Saved played compilation: <CompilationFileLink filePath={savedOutputPath} />
                                </p>
                            ) : null}
                        </div>

                        <button
                            className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-3 font-medium text-sm shadow-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={data.blockedByCompilationDuplicates || isSaving}
                            onClick={handleSavePlayback}
                            type="button"
                        >
                            {isSaving ? 'Saving...' : 'Save Played Compilation'}
                        </button>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-4">
                        <div>
                            <p className="text-muted-foreground text-xs">Valid Files</p>
                            <p className="font-semibold text-2xl text-green-700">{data.validFileCount}</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground text-xs">Applied Excerpts</p>
                            <p className="font-semibold text-2xl">{data.appliedExcerptCount}</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground text-xs">Candidate Excerpts</p>
                            <p className="font-semibold text-2xl">{data.totalCandidateExcerptCount}</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground text-xs">Invalid Files Skipped</p>
                            <p className="font-semibold text-2xl text-amber-700">{data.invalidFileCount}</p>
                        </div>
                    </div>
                    <div className="mt-4 text-sm">
                        <p className="text-muted-foreground text-xs">Compilation File</p>
                        <p className="mt-1 break-all">
                            <CompilationFileLink filePath={data.compilationFilePath} />
                        </p>
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl border bg-card p-4">
                        <h2 className="font-semibold text-base">Before Playback</h2>
                        <div className="mt-3 grid gap-4 md:grid-cols-2">
                            <div>
                                <p className="text-muted-foreground text-xs">Translated Excerpts</p>
                                <p className="font-semibold text-2xl">
                                    {data.compilationStatsBefore.excerpts.translated}
                                </p>
                            </div>
                            <div>
                                <p className="text-muted-foreground text-xs">Untranslated Excerpts</p>
                                <p className="font-semibold text-2xl">
                                    {data.compilationStatsBefore.excerpts.untranslated}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-xl border bg-card p-4">
                        <h2 className="font-semibold text-base">After Playback</h2>
                        <div className="mt-3 grid gap-4 md:grid-cols-2">
                            <div>
                                <p className="text-muted-foreground text-xs">Translated Excerpts</p>
                                <p className="font-semibold text-2xl text-green-700">
                                    {data.compilationStatsAfter.excerpts.translated}
                                </p>
                            </div>
                            <div>
                                <p className="text-muted-foreground text-xs">Untranslated Excerpts</p>
                                <p className="font-semibold text-2xl">
                                    {data.compilationStatsAfter.excerpts.untranslated}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                    <CollapsibleReportCard
                        countLabel={`${data.validFilePaths.length} valid translation files were considered for playback.`}
                        title="Played Files"
                    >
                        {renderPlayedFileList(data.validFilePaths)}
                    </CollapsibleReportCard>

                    <CollapsibleReportCard
                        countLabel={`${data.skippedAlreadyTranslatedExcerptIds.length} excerpt IDs were skipped because the target was already translated.`}
                        title="Skipped Already Translated"
                    >
                        <ExcerptIssueTable items={data.skippedAlreadyTranslatedExcerptIds} />
                    </CollapsibleReportCard>

                    <CollapsibleReportCard
                        countLabel={`${data.duplicateExcerptIds.length} excerpt IDs appeared in more than one valid translation file.`}
                        title="Duplicate Excerpt IDs"
                    >
                        <ExcerptIssueTable items={data.duplicateExcerptIds} />
                    </CollapsibleReportCard>

                    <CollapsibleReportCard
                        countLabel={`${data.compilationDuplicateTargetIds.length} compilation IDs appear in more than one target collection.`}
                        defaultOpen={data.blockedByCompilationDuplicates}
                        title="Compilation Duplicate Target IDs"
                    >
                        <CompilationTargetIssueTable
                            compilationFilePath={data.compilationFilePath}
                            items={data.compilationDuplicateTargetIds}
                        />
                    </CollapsibleReportCard>

                    <CollapsibleReportCard
                        countLabel={`${data.unknownCompilationExcerptIds.length} excerpt IDs were not found in the compilation.`}
                        title="Unknown Compilation Excerpt IDs"
                    >
                        <ExcerptIssueTable items={data.unknownCompilationExcerptIds} />
                    </CollapsibleReportCard>
                </div>
            </div>
        </>
    );
};

export default ValidPlaybackPage;

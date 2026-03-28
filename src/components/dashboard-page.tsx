import { Link } from '@tanstack/react-router';

import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import type { DashboardStatsResponse } from '@/lib/shell-types';

type DashboardPageProps = { stats: DashboardStatsResponse | null; statsError: string | null };

const formatCheckedAt = (checkedAt: string | undefined) => {
    if (!checkedAt) {
        return '...';
    }

    return checkedAt.replace('T', ' ').replace('Z', ' UTC');
};

const formatIsoFromTimestamp = (value: number | null | undefined) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return '...';
    }

    return new Date(value * 1000).toISOString().replace('T', ' ').replace('Z', ' UTC');
};

const formatWorkDuration = (durationSeconds: number | null | undefined) => {
    if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds)) {
        return '...';
    }

    const totalMinutes = Math.max(0, Math.floor(durationSeconds / 60));
    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutes = totalMinutes % 60;

    return [
        days > 0 ? `${days}d` : null,
        hours > 0 ? `${hours}h` : null,
        minutes > 0 || (days === 0 && hours === 0) ? `${minutes}m` : null,
    ]
        .filter(Boolean)
        .join(' ');
};

type CompilationStatsCardProps = { compilationStats: DashboardStatsResponse['compilationStats'] };

const CompilationStatsCard = ({ compilationStats }: CompilationStatsCardProps) => (
    <div className="rounded-xl border bg-card p-4">
        <h2 className="font-semibold text-base">Compilation Stats</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-4">
            <div>
                <p className="text-muted-foreground text-xs">Untranslated</p>
                <p className="font-semibold text-2xl text-amber-700">
                    {compilationStats?.untranslatedSegments.toLocaleString() ?? '...'}
                </p>
            </div>
            <div>
                <p className="text-muted-foreground text-xs">Translated</p>
                <p className="font-semibold text-2xl text-green-700">
                    {compilationStats?.translatedSegments.toLocaleString() ?? '...'}
                </p>
            </div>
            <div>
                <p className="text-muted-foreground text-xs">Total Segments</p>
                <p className="font-semibold text-2xl">{compilationStats?.totalSegments.toLocaleString() ?? '...'}</p>
            </div>
            <div>
                <p className="text-muted-foreground text-xs">Unique Translators</p>
                <p className="font-semibold text-2xl">
                    {compilationStats?.uniqueTranslators.toLocaleString() ?? '...'}
                </p>
            </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="font-medium">Excerpt Coverage</p>
                <p className="mt-1 text-muted-foreground">
                    {compilationStats
                        ? `${compilationStats.excerpts.translated.toLocaleString()} translated / ${compilationStats.excerpts.untranslated.toLocaleString()} untranslated / ${compilationStats.excerpts.total.toLocaleString()} total`
                        : '...'}
                </p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="font-medium">Heading Coverage</p>
                <p className="mt-1 text-muted-foreground">
                    {compilationStats
                        ? `${compilationStats.headings.translated.toLocaleString()} translated / ${compilationStats.headings.untranslated.toLocaleString()} untranslated / ${compilationStats.headings.total.toLocaleString()} total`
                        : '...'}
                </p>
            </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="text-sm">
                <p className="text-muted-foreground text-xs">Created</p>
                <p className="mt-1 break-all">{formatIsoFromTimestamp(compilationStats?.createdAt)}</p>
            </div>
            <div className="text-sm">
                <p className="text-muted-foreground text-xs">Last Updated</p>
                <p className="mt-1 break-all">{formatIsoFromTimestamp(compilationStats?.lastUpdatedAt)}</p>
            </div>
            <div className="text-sm">
                <p className="text-muted-foreground text-xs">Elapsed Work Span</p>
                <p className="mt-1">{formatWorkDuration(compilationStats?.workDurationMs)}</p>
            </div>
        </div>
    </div>
);

const getConfiguredPathStatus = ({
    configured,
    exists,
    path,
}: {
    configured: boolean;
    exists: boolean;
    path: string | null;
}) => {
    if (!configured) {
        return 'Not configured';
    }

    if (exists) {
        return path;
    }

    return `${path ?? 'Configured path'} (missing)`;
};

const DashboardPage = ({ stats, statsError }: DashboardPageProps) => {
    const translationStats = stats?.translationStats;
    const compilationFileStatus = stats
        ? getConfiguredPathStatus({
              configured: stats.health.compilationFileConfigured,
              exists: stats.health.compilationFileExists,
              path: stats.health.compilationFilePath,
          })
        : null;
    const translationsDirectoryStatus = stats
        ? getConfiguredPathStatus({
              configured: stats.health.translationsDirectoryConfigured,
              exists: stats.health.translationsDirectoryExists,
              path: stats.health.translationsDirectoryPath,
          })
        : null;

    return (
        <>
            <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
                <SidebarTrigger className="-ml-1" />
                <Separator className="mr-2 data-[orientation=vertical]:h-4" orientation="vertical" />
                <Breadcrumb>
                    <BreadcrumbList>
                        <BreadcrumbItem>
                            <BreadcrumbPage>Dashboard</BreadcrumbPage>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>
            </header>

            <div className="flex flex-1 flex-col gap-4 p-4">
                {statsError ? <p className="text-destructive text-sm">{statsError}</p> : null}

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl border bg-card p-4">
                        <h2 className="font-semibold text-base">Health Status</h2>
                        <p className="mt-3 text-sm">
                            System status:{' '}
                            <span className={stats?.health.ok ? 'text-green-700' : 'text-destructive'}>
                                {stats?.health.ok ? 'OK' : 'Degraded'}
                            </span>
                        </p>
                        <div className="mt-2 text-sm">
                            <p>Compilation file:</p>
                            <p className="mt-1 break-all text-muted-foreground">{compilationFileStatus ?? '...'}</p>
                        </div>
                        <div className="mt-2 text-sm">
                            <p>Translations directory:</p>
                            <p className="mt-1 break-all text-muted-foreground">
                                {translationsDirectoryStatus ?? '...'}
                            </p>
                        </div>
                        <p className="mt-2 text-muted-foreground text-xs">
                            Checked at {formatCheckedAt(stats?.checkedAt)}
                        </p>
                    </div>

                    <div className="rounded-xl border bg-card p-4">
                        <h2 className="font-semibold text-base">Translation Stats</h2>
                        <div className="mt-3 grid gap-4 md:grid-cols-4">
                            <div>
                                <p className="text-muted-foreground text-xs">Total Files</p>
                                <p className="font-semibold text-2xl">{translationStats?.totalFiles ?? '...'}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground text-xs">Valid</p>
                                {translationStats ? (
                                    <Link
                                        aria-label="Simulate playback for valid translations"
                                        className="font-semibold text-2xl text-green-700 underline-offset-4 hover:underline"
                                        to="/valid"
                                    >
                                        {translationStats.validFiles}
                                    </Link>
                                ) : (
                                    <p className="font-semibold text-2xl text-green-700">...</p>
                                )}
                            </div>
                            <div>
                                <p className="text-muted-foreground text-xs">Invalid</p>
                                {translationStats ? (
                                    <Link
                                        aria-label="View invalid excerpts"
                                        className="font-semibold text-2xl text-destructive underline-offset-4 hover:underline"
                                        to="/invalid"
                                    >
                                        {translationStats.invalidFiles}
                                    </Link>
                                ) : (
                                    <p className="font-semibold text-2xl text-destructive">...</p>
                                )}
                            </div>
                            <div>
                                <p className="text-muted-foreground text-xs">Patches Applied</p>
                                <p className="font-semibold text-2xl">{translationStats?.patchesApplied ?? '...'}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <CompilationStatsCard compilationStats={stats?.compilationStats} />
            </div>
        </>
    );
};

export default DashboardPage;

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
                        <div className="mt-3 grid grid-cols-3 gap-4">
                            <div>
                                <p className="text-muted-foreground text-xs">Total Files</p>
                                <p className="font-semibold text-2xl">{translationStats?.totalFiles ?? '...'}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground text-xs">Valid</p>
                                <p className="font-semibold text-2xl text-green-700">
                                    {translationStats?.validFiles ?? '...'}
                                </p>
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
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default DashboardPage;

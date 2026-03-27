import { Link } from '@tanstack/react-router';

import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import type { DashboardStatsResponse } from '@/lib/shell-types';

type DashboardPageProps = { stats: DashboardStatsResponse | null; statsError: string | null };

const DashboardPage = ({ stats, statsError }: DashboardPageProps) => {
    const translationStats = stats?.translationStats;

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
                        <p className="mt-2 text-sm">
                            Compilation file:{' '}
                            {stats?.health.compilationFileConfigured
                                ? stats.health.compilationFileExists
                                    ? 'Available'
                                    : 'Missing'
                                : 'Not configured'}
                        </p>
                        <p className="mt-2 text-sm">
                            Translations directory:{' '}
                            {stats?.health.translationsDirectoryConfigured
                                ? stats.health.translationsDirectoryExists
                                    ? 'Available'
                                    : 'Missing'
                                : 'Not configured'}
                        </p>
                        <p className="mt-2 text-muted-foreground text-xs">
                            Checked at {stats?.checkedAt ? new Date(stats.checkedAt).toLocaleString() : '...'}
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

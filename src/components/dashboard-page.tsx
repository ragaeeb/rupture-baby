'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { AppFooter } from '@/components/app-footer';
import { AppSidebar } from '@/components/app-sidebar';
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import {
    fetchDashboardStats,
    fetchTranslationTree,
    getCachedDashboardStats,
    getCachedTranslationTree,
} from '@/lib/shell-api';
import type { DashboardStatsResponse, TranslationTreeResponse } from '@/lib/shell-types';
import { filterTranslationTreeEntries, type TranslationTreeFilter } from '@/lib/translation-tree-filter';

const DashboardPageContent = () => {
    const searchParams = useSearchParams();
    const [stats, setStats] = useState<DashboardStatsResponse | null>(() => getCachedDashboardStats());
    const [statsError, setStatsError] = useState<string | null>(null);
    const [tree, setTree] = useState<TranslationTreeResponse | null>(() => getCachedTranslationTree());

    const modelFilter = searchParams.get('model') || 'all';
    const statusFilter = searchParams.get('status') || 'all';

    const filter: TranslationTreeFilter = {
        model: modelFilter as TranslationTreeFilter['model'],
        status: statusFilter as TranslationTreeFilter['status'],
    };

    useEffect(() => {
        let isMounted = true;

        const loadTree = async () => {
            try {
                const translationTree = await fetchTranslationTree({ force: true });
                if (isMounted) {
                    setTree(translationTree);
                }
            } catch {
                if (isMounted) {
                    setTree(null);
                }
            }
        };

        const loadStats = async () => {
            try {
                setStatsError(null);
                const dashboardStats = await fetchDashboardStats({ force: true });
                if (!isMounted) {
                    return;
                }
                setStats(dashboardStats);
            } catch (error) {
                if (!isMounted) {
                    return;
                }
                setStatsError(error instanceof Error ? error.message : 'Failed to load dashboard stats.');
            }
        };

        loadTree();
        loadStats();

        return () => {
            isMounted = false;
        };
    }, []);

    const translationStats = stats?.translationStats;
    const filteredEntries = tree ? filterTranslationTreeEntries(tree.entries, translationStats, filter) : [];

    return (
        <SidebarProvider>
            <Suspense fallback={null}>
                <AppSidebar
                    entries={filteredEntries}
                    rootName={tree?.rootName || 'translations'}
                    translationStats={translationStats}
                />
            </Suspense>
            <SidebarInset>
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
                                    <p className="font-semibold text-2xl text-destructive">
                                        {translationStats?.invalidFiles ?? '...'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <AppFooter />
            </SidebarInset>
        </SidebarProvider>
    );
};

const DashboardPage = () => (
    <Suspense fallback={null}>
        <DashboardPageContent />
    </Suspense>
);

export default DashboardPage;

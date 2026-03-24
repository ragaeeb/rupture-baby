'use client';

import { useEffect, useState } from 'react';
import { AppFooter } from '@/components/app-footer';
import { AppSidebar } from '@/components/app-sidebar';
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { fetchDashboardStats, fetchTranslationTree } from '@/lib/shell-api';
import type { DashboardStatsResponse, TranslationTreeResponse } from '@/lib/shell-types';

const DashboardPage = () => {
    const [stats, setStats] = useState<DashboardStatsResponse | null>(null);
    const [statsError, setStatsError] = useState<string | null>(null);
    const [tree, setTree] = useState<TranslationTreeResponse | null>(null);

    useEffect(() => {
        let isMounted = true;

        const loadTree = async () => {
            try {
                const translationTree = await fetchTranslationTree();
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
                const dashboardStats = await fetchDashboardStats();
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

    return (
        <SidebarProvider>
            <AppSidebar entries={tree?.entries || []} rootName={tree?.rootName || 'translations'} />
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
                            <h2 className="font-semibold text-base">Runtime</h2>
                            <p className="mt-3 text-sm">Port: {stats?.stats.port || '...'}</p>
                            <p className="mt-2 text-sm">
                                Translations captured: {stats?.stats.translationFilesCount ?? '...'}
                            </p>
                            <p className="mt-2 text-sm">Folder: {stats?.stats.translationsDirectoryName || '...'}</p>
                        </div>
                    </div>
                </div>
                <AppFooter />
            </SidebarInset>
        </SidebarProvider>
    );
};

export default DashboardPage;

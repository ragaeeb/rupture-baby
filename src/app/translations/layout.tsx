'use client';

import { usePathname, useSearchParams } from 'next/navigation';
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

const TranslationsLayoutContent = ({ children }: { children: React.ReactNode }) => {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [tree, setTree] = useState<TranslationTreeResponse | null>(() => getCachedTranslationTree());
    const [stats, setStats] = useState<DashboardStatsResponse | null>(() => getCachedDashboardStats());
    const [treeError, setTreeError] = useState<string | null>(null);

    const modelFilter = searchParams.get('model') || 'all';
    const statusFilter = searchParams.get('status') || 'all';
    const filter: TranslationTreeFilter = {
        model: modelFilter as TranslationTreeFilter['model'],
        status: statusFilter as TranslationTreeFilter['status'],
    };

    // Extract selected file path from the pathname /translations/[fileNameId]
    const match = pathname.match(/^\/translations\/(.+)$/);
    let selectedFilePath: string | null = null;
    let displayName = 'Translation file';
    if (match?.[1]) {
        try {
            selectedFilePath = decodeURIComponent(match[1]);
            displayName = selectedFilePath.split('/').pop() || 'Translation file';
        } catch {
            // Invalid encoding, leave as null
        }
    }

    useEffect(() => {
        let isMounted = true;

        const loadTree = async () => {
            try {
                setTreeError(null);
                const translationTree = await fetchTranslationTree({ force: true });
                if (!isMounted) {
                    return;
                }
                setTree(translationTree);
            } catch (error) {
                if (!isMounted) {
                    return;
                }
                setTreeError(error instanceof Error ? error.message : 'Failed to load translation files.');
            }
        };

        const loadStats = async () => {
            try {
                const dashboardStats = await fetchDashboardStats({ force: true });
                if (!isMounted) {
                    return;
                }
                setStats(dashboardStats);
            } catch {
                if (isMounted) {
                    setStats(null);
                }
            }
        };

        loadTree();
        loadStats();

        return () => {
            isMounted = false;
        };
    }, []);

    const filteredEntries = tree ? filterTranslationTreeEntries(tree.entries, stats?.translationStats, filter) : [];

    return (
        <SidebarProvider>
            <Suspense fallback={null}>
                <AppSidebar
                    entries={filteredEntries}
                    rootName={tree?.rootName || 'translations'}
                    translationStats={stats?.translationStats}
                    selectedFilePath={selectedFilePath}
                />
            </Suspense>
            <SidebarInset>
                <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
                    <SidebarTrigger className="-ml-1" />
                    <Separator className="mr-2 data-[orientation=vertical]:h-4" orientation="vertical" />
                    <Breadcrumb className="min-w-0 flex-1">
                        <BreadcrumbList className="min-w-0 flex-nowrap">
                            <BreadcrumbItem className="min-w-0">
                                <BreadcrumbPage className="block truncate" title={displayName}>
                                    {displayName}
                                </BreadcrumbPage>
                            </BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>
                </header>

                <div className="flex min-h-0 flex-1 flex-col p-4">
                    {treeError ? <p className="text-destructive text-sm">{treeError}</p> : null}
                    <Suspense fallback={<p className="text-muted-foreground text-sm">Loading file…</p>}>
                        {children}
                    </Suspense>
                </div>
                <AppFooter />
            </SidebarInset>
        </SidebarProvider>
    );
};

export default function TranslationsLayout({ children }: { children: React.ReactNode }) {
    return (
        <Suspense fallback={null}>
            <TranslationsLayoutContent>{children}</TranslationsLayoutContent>
        </Suspense>
    );
}

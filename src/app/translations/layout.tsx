'use client';

import { usePathname } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { AppFooter } from '@/components/app-footer';
import { AppSidebar } from '@/components/app-sidebar';
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { fetchTranslationTree } from '@/lib/shell-api';
import type { TranslationTreeResponse } from '@/lib/shell-types';

export default function TranslationsLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [tree, setTree] = useState<TranslationTreeResponse | null>(null);
    const [treeError, setTreeError] = useState<string | null>(null);

    // Extract selected file path from the pathname /translations/[fileNameId]
    // React Compiler will memoize this automatically
    const match = pathname.match(/^\/translations\/(.+)$/);
    let selectedFilePath: string | null = null;
    if (match?.[1]) {
        try {
            selectedFilePath = decodeURIComponent(match[1]);
        } catch {
            // Invalid encoding, leave as null
        }
    }

    useEffect(() => {
        let isMounted = true;

        const loadTree = async () => {
            try {
                setTreeError(null);
                const translationTree = await fetchTranslationTree();
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

        loadTree();

        return () => {
            isMounted = false;
        };
    }, []);

    return (
        <SidebarProvider>
            <AppSidebar
                entries={tree?.entries || []}
                rootName={tree?.rootName || 'translations'}
                selectedFilePath={selectedFilePath}
            />
            <SidebarInset>
                <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
                    <SidebarTrigger className="-ml-1" />
                    <Separator className="mr-2 data-[orientation=vertical]:h-4" orientation="vertical" />
                    <Breadcrumb className="min-w-0 flex-1">
                        <BreadcrumbList className="min-w-0 flex-nowrap">
                            <BreadcrumbItem className="min-w-0">
                                <BreadcrumbPage
                                    className="block truncate"
                                    title={selectedFilePath || 'Translation file'}
                                >
                                    {selectedFilePath ? selectedFilePath.split('/').pop() : 'Translation file'}
                                </BreadcrumbPage>
                            </BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>
                </header>

                <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
                    {treeError ? <p className="text-destructive text-sm">{treeError}</p> : null}
                    <Suspense fallback={<p className="text-muted-foreground text-sm">Loading file…</p>}>
                        {children}
                    </Suspense>
                </div>
                <AppFooter />
            </SidebarInset>
        </SidebarProvider>
    );
}

'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { fetchTranslationTree } from '@/lib/shell-api';
import type { TranslationTreeNode, TranslationTreeResponse } from '@/lib/shell-types';

const findFirstJsonFilePath = (entries: TranslationTreeNode[]): string | null => {
    for (const entry of entries) {
        if (entry.kind === 'file') {
            return entry.relativePath;
        }
        if (entry.children?.length) {
            const nestedPath = findFirstJsonFilePath(entry.children);
            if (nestedPath) {
                return nestedPath;
            }
        }
    }
    return null;
};

const Home = () => {
    const router = useRouter();
    const [tree, setTree] = useState<TranslationTreeResponse | null>(null);
    const [treeError, setTreeError] = useState<string | null>(null);

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

                const firstFilePath = findFirstJsonFilePath(translationTree.entries);
                if (firstFilePath) {
                    const encodedPath = encodeURIComponent(firstFilePath);
                    router.replace(`/translations/${encodedPath}`);
                }
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
    }, [router]);

    return (
        <SidebarProvider>
            <SidebarInset>
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-4">
                    {treeError ? <p className="text-destructive text-sm">{treeError}</p> : null}
                    <p className="text-muted-foreground text-sm">Redirecting...</p>
                </div>
            </SidebarInset>
        </SidebarProvider>
    );
};

export default Home;

'use client';

import { useRouter } from 'next/navigation';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useState } from 'react';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { fetchTranslationTree } from '@/lib/shell-api';
import type { TranslationTreeNode, TranslationTreeResponse } from '@/lib/shell-types';

const findFirstJsonFilePath = (entries: TranslationTreeNode[], parentPath = ''): string | null => {
    for (const entry of entries) {
        // Only return actual files, not conversation sub-items
        if (entry.kind === 'file') {
            // Skip conversation sub-paths (they contain '/')
            if (entry.relativePath.includes('/')) {
                continue;
            }
            return entry.relativePath;
        }
        if (entry.children?.length) {
            const nestedPath = findFirstJsonFilePath(entry.children, entry.relativePath);
            if (nestedPath) {
                return nestedPath;
            }
        }
    }
    return null;
};

const redirectToFirstFile = (router: ReturnType<typeof useRouter>, translationTree: TranslationTreeResponse) => {
    const firstFilePath = findFirstJsonFilePath(translationTree.entries);
    if (!firstFilePath) {
        return false;
    }

    const encodedPath = encodeURIComponent(firstFilePath);
    router.replace(`/translations/${encodedPath}`);
    return true;
};

const handleMissingTranslationFiles = (
    setTree: Dispatch<SetStateAction<TranslationTreeResponse | null>>,
    setTreeError: Dispatch<SetStateAction<string | null>>,
    setRedirectPending: Dispatch<SetStateAction<boolean>>,
) => {
    setTree(null);
    setTreeError('No translation files were found.');
    setRedirectPending(false);
};

const handleLoadedTree = (
    router: ReturnType<typeof useRouter>,
    translationTree: TranslationTreeResponse,
    setTree: Dispatch<SetStateAction<TranslationTreeResponse | null>>,
    setTreeError: Dispatch<SetStateAction<string | null>>,
    setRedirectPending: Dispatch<SetStateAction<boolean>>,
) => {
    setTree(translationTree);
    setTreeError(null);

    if (redirectToFirstFile(router, translationTree)) {
        return;
    }

    handleMissingTranslationFiles(setTree, setTreeError, setRedirectPending);
};

const handleTreeLoadError = (
    error: unknown,
    setTree: Dispatch<SetStateAction<TranslationTreeResponse | null>>,
    setTreeError: Dispatch<SetStateAction<string | null>>,
    setRedirectPending: Dispatch<SetStateAction<boolean>>,
) => {
    setTree(null);
    setTreeError(error instanceof Error ? error.message : 'Failed to load translation files.');
    setRedirectPending(false);
};

const Home = () => {
    const router = useRouter();
    const [tree, setTree] = useState<TranslationTreeResponse | null>(null);
    const [treeError, setTreeError] = useState<string | null>(null);
    const [redirectPending, setRedirectPending] = useState(true);

    useEffect(() => {
        let isMounted = true;

        const loadTree = async () => {
            try {
                setTree(null);
                setTreeError(null);
                setRedirectPending(true);
                const translationTree = await fetchTranslationTree();
                if (!isMounted) {
                    return;
                }

                handleLoadedTree(router, translationTree, setTree, setTreeError, setRedirectPending);
            } catch (error) {
                if (!isMounted) {
                    return;
                }
                handleTreeLoadError(error, setTree, setTreeError, setRedirectPending);
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
                    {redirectPending && tree === null && !treeError ? (
                        <p className="text-muted-foreground text-sm">Redirecting...</p>
                    ) : null}
                </div>
            </SidebarInset>
        </SidebarProvider>
    );
};

export default Home;

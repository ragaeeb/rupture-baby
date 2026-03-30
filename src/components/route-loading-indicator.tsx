'use client';

import { useRouterState } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

export const RouteLoadingIndicator = () => {
    const [isMounted, setIsMounted] = useState(false);
    const isLoading = useRouterState({ select: (state) => state.isLoading || state.status === 'pending' });

    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted || !isLoading) {
        return null;
    }

    return (
        <div
            aria-live="polite"
            className="pointer-events-none fixed top-4 right-4 z-50 flex items-center gap-2 rounded-full border bg-background/95 px-3 py-1.5 text-muted-foreground text-sm shadow-sm backdrop-blur"
        >
            <Loader2 className="size-4 animate-spin text-foreground" />
            <span>Loading…</span>
        </div>
    );
};

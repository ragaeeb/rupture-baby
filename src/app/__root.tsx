import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import type * as React from 'react';

import { parseBrowseSearch } from '@/lib/browse-search';
import { getErrorMessage } from '@/lib/error-utils';
import appCss from './globals.css?url';

export const Route = createRootRoute({
    component: RootComponent,
    errorComponent: RootErrorComponent,
    head: () => ({
        links: [
            { href: appCss, rel: 'stylesheet' },
            { href: '/favicon.ico', rel: 'icon' },
        ],
        meta: [
            { charSet: 'utf-8' },
            { content: 'width=device-width, initial-scale=1', name: 'viewport' },
            { title: 'Rupture Baby' },
        ],
    }),
    notFoundComponent: NotFoundComponent,
    validateSearch: parseBrowseSearch,
});

function RootComponent() {
    return (
        <RootDocument>
            <Outlet />
        </RootDocument>
    );
}

function RootDocument({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <head>
                <HeadContent />
            </head>
            <body>
                <div className="min-h-screen bg-background text-foreground">{children}</div>
                <Scripts />
            </body>
        </html>
    );
}

function RootErrorComponent(props: { error: Error }) {
    return (
        <RootDocument>
            <div className="flex min-h-screen items-center justify-center p-6">
                <div className="w-full max-w-xl rounded-xl border bg-card p-6">
                    <h1 className="font-semibold text-lg">Application Error</h1>
                    <p className="mt-2 text-muted-foreground text-sm">
                        {getErrorMessage(props.error, 'An unexpected error occurred.')}
                    </p>
                </div>
            </div>
        </RootDocument>
    );
}

function NotFoundComponent() {
    return (
        <div className="flex min-h-screen items-center justify-center p-6">
            <div className="w-full max-w-xl rounded-xl border bg-card p-6">
                <h1 className="font-semibold text-lg">Not Found</h1>
                <p className="mt-2 text-muted-foreground text-sm">The requested page could not be found.</p>
            </div>
        </div>
    );
}

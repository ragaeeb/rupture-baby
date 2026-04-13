import { createFileRoute, Outlet, useLocation } from '@tanstack/react-router';

import { AppFooter } from '@/components/app-footer';
import { AppSidebar } from '@/components/app-sidebar';
import { RouteLoadingIndicator } from '@/components/route-loading-indicator';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { fetchBrowseShellData } from '@/lib/server-functions';

export const Route = createFileRoute('/_browse')({
    component: BrowseLayoutComponent,
    loader: async () => fetchBrowseShellData(),
});

function BrowseLayoutComponent() {
    const { meta, translationStats, tree } = Route.useLoaderData();
    const pathname = useLocation({ select: (location) => location.pathname });

    const selectedFilePath = pathname.startsWith('/translations/')
        ? (() => {
              try {
                  return decodeURIComponent(pathname.replace('/translations/', ''));
              } catch {
                  return null;
              }
          })()
        : null;

    return (
        <SidebarProvider>
            <AppSidebar
                entries={tree?.entries ?? []}
                rootName={tree?.rootName ?? 'translations'}
                selectedFilePath={selectedFilePath}
                translationStats={translationStats}
            />
            <SidebarInset>
                <RouteLoadingIndicator />
                <Outlet />
                <AppFooter meta={meta} />
            </SidebarInset>
        </SidebarProvider>
    );
}

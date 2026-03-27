import { createFileRoute, getRouteApi, Outlet, useLocation } from '@tanstack/react-router';

import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';

const browseRouteApi = getRouteApi('/_browse');

export const Route = createFileRoute('/_browse/translations')({ component: TranslationsLayoutComponent });

function TranslationsLayoutComponent() {
    const { treeError } = browseRouteApi.useLoaderData();
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

    const displayName =
        pathname === '/translations' ? 'Translations' : selectedFilePath?.split('/').at(-1) || 'Translation file';

    return (
        <>
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
                <Outlet />
            </div>
        </>
    );
}

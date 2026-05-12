import { createFileRoute } from '@tanstack/react-router';

import CompilationBrowserPage from '@/components/compilation-browser-page';
import { parseCompilationBrowseRouteSearch } from '@/lib/browse-search';
import {
    DEFAULT_COMPILATION_BROWSE_COLLECTION,
    DEFAULT_COMPILATION_BROWSE_PAGE,
    DEFAULT_COMPILATION_BROWSE_PAGE_SIZE,
} from '@/lib/compilation-browser-shared';
import { fetchCompilationBrowsePageData } from '@/lib/server-functions';

export const Route = createFileRoute('/_browse/compilation')({
    component: CompilationRouteComponent,
    loader: async ({ deps }) => fetchCompilationBrowsePageData({ data: deps }),
    loaderDeps: ({ search }) => ({
        collection: search.collection ?? DEFAULT_COMPILATION_BROWSE_COLLECTION,
        page: search.page ?? DEFAULT_COMPILATION_BROWSE_PAGE,
        pageSize: search.pageSize ?? DEFAULT_COMPILATION_BROWSE_PAGE_SIZE,
    }),
    validateSearch: parseCompilationBrowseRouteSearch,
});

function CompilationRouteComponent() {
    const data = Route.useLoaderData();
    const search = Route.useSearch();
    return <CompilationBrowserPage data={data} search={search} />;
}

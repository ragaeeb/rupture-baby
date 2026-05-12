import { createFileRoute } from '@tanstack/react-router';

import CompilationExportPage from '@/components/compilation-export-page';
import { parseCompilationExportRouteSearch } from '@/lib/browse-search';
import {
    DEFAULT_COMPILATION_EXPORT_CONTEXT_WINDOW_TOKENS,
    DEFAULT_COMPILATION_EXPORT_PROVIDER,
    DEFAULT_COMPILATION_EXPORT_RESERVED_TOKENS,
} from '@/lib/compilation-export-shared';
import { fetchCompilationExportPageData } from '@/lib/server-functions';

export const Route = createFileRoute('/_browse/exports')({
    component: CompilationExportsRouteComponent,
    loader: async ({ deps }) => fetchCompilationExportPageData({ data: deps }),
    loaderDeps: ({ search }) => ({
        contextWindowTokens: search.contextWindowTokens ?? DEFAULT_COMPILATION_EXPORT_CONTEXT_WINDOW_TOKENS,
        provider: search.provider ?? DEFAULT_COMPILATION_EXPORT_PROVIDER,
        reservedTokens: search.reservedTokens ?? DEFAULT_COMPILATION_EXPORT_RESERVED_TOKENS,
    }),
    validateSearch: parseCompilationExportRouteSearch,
});

function CompilationExportsRouteComponent() {
    const data = Route.useLoaderData();
    const search = Route.useSearch();

    return <CompilationExportPage data={data} search={search} />;
}

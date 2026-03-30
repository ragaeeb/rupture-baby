import { createFileRoute } from '@tanstack/react-router';

import AnalyticsPage from '@/components/analytics-page';
import { fetchAnalyticsPageData } from '@/lib/server-functions';

export const Route = createFileRoute('/_browse/analytics')({
    component: AnalyticsRouteComponent,
    loader: async () => fetchAnalyticsPageData(),
});

function AnalyticsRouteComponent() {
    const data = Route.useLoaderData();
    return <AnalyticsPage data={data} />;
}

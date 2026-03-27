import { createFileRoute, getRouteApi } from '@tanstack/react-router';

import DashboardPage from '@/components/dashboard-page';

const browseRouteApi = getRouteApi('/_browse');

export const Route = createFileRoute('/_browse/dashboard')({ component: DashboardAliasComponent });

function DashboardAliasComponent() {
    const { stats, statsError } = browseRouteApi.useLoaderData();
    return <DashboardPage stats={stats} statsError={statsError} />;
}

import { createFileRoute } from '@tanstack/react-router';

import DashboardPage from '@/components/dashboard-page';
import { fetchDashboardStatsData } from '@/lib/server-functions';

export const Route = createFileRoute('/_browse/dashboard')({
    component: DashboardAliasComponent,
    loader: async () => fetchDashboardStatsData(),
});

function DashboardAliasComponent() {
    const { stats, statsError } = Route.useLoaderData();
    return <DashboardPage stats={stats} statsError={statsError} />;
}

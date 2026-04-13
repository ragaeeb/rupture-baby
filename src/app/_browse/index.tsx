import { createFileRoute } from '@tanstack/react-router';

import DashboardPage from '@/components/dashboard-page';
import { fetchDashboardStatsData } from '@/lib/server-functions';

export const Route = createFileRoute('/_browse/')({
    component: DashboardIndexComponent,
    loader: async () => fetchDashboardStatsData(),
});

function DashboardIndexComponent() {
    const { stats, statsError } = Route.useLoaderData();
    return <DashboardPage stats={stats} statsError={statsError} />;
}

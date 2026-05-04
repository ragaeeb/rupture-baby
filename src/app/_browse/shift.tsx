import { createFileRoute } from '@tanstack/react-router';

import ShiftSettingsPage from '@/components/shift-settings-page';
import { fetchShiftSettingsPageData } from '@/lib/server-functions';

export const Route = createFileRoute('/_browse/shift')({
    component: ShiftRouteComponent,
    loader: async () => fetchShiftSettingsPageData(),
});

function ShiftRouteComponent() {
    const data = Route.useLoaderData();
    return <ShiftSettingsPage data={data} />;
}

import { createFileRoute } from '@tanstack/react-router';

import ValidPlaybackPage from '@/components/valid-playback-page';
import { fetchCompilationPlaybackSimulationData } from '@/lib/server-functions';

export const Route = createFileRoute('/_browse/valid')({
    component: ValidPlaybackRouteComponent,
    loader: async () => fetchCompilationPlaybackSimulationData(),
});

function ValidPlaybackRouteComponent() {
    const data = Route.useLoaderData();
    return <ValidPlaybackPage data={data} />;
}

import { createFileRoute } from '@tanstack/react-router';

import InvalidExcerptsPage from '@/components/invalid-excerpts-page';
import { fetchInvalidExcerptsData } from '@/lib/server-functions';

export const Route = createFileRoute('/_browse/invalid')({
    component: InvalidRouteComponent,
    loader: async () => fetchInvalidExcerptsData(),
});

function InvalidRouteComponent() {
    const data = Route.useLoaderData();
    console.log('data', data);
    return <InvalidExcerptsPage data={data} />;
}

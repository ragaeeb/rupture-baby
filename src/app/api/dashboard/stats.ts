import '@tanstack/react-start/server-only';

import { createFileRoute } from '@tanstack/react-router';

import { getDashboardStatsResponse } from '@/lib/app-services';
import { MissingPathConfigError } from '@/lib/data-paths';

export const GET = async () => {
    try {
        return Response.json(await getDashboardStatsResponse());
    } catch (error) {
        if (error instanceof MissingPathConfigError) {
            return Response.json({ error: error.message, key: error.key }, { status: 400 });
        }

        return Response.json({ error: 'Failed to read dashboard stats.' }, { status: 500 });
    }
};

export const Route = createFileRoute('/api/dashboard/stats')({ server: { handlers: { GET: () => GET() } } });

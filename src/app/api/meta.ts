import '@tanstack/react-start/server-only';

import { createFileRoute } from '@tanstack/react-router';

import { getAppMeta } from '@/lib/app-meta';

export const GET = async () => {
    try {
        return Response.json(await getAppMeta());
    } catch {
        return Response.json({ error: 'Failed to read application metadata.' }, { status: 500 });
    }
};

export const Route = createFileRoute('/api/meta')({ server: { handlers: { GET: () => GET() } } });

import '@tanstack/react-start/server-only';

import { createFileRoute } from '@tanstack/react-router';

import { MissingPathConfigError } from '@/lib/data-paths';
import { getTranslationTree } from '@/lib/translations-browser';

export const GET = async () => {
    try {
        return Response.json(await getTranslationTree());
    } catch (error) {
        if (error instanceof MissingPathConfigError) {
            return Response.json({ error: error.message, key: error.key }, { status: 400 });
        }

        return Response.json({ error: 'Failed to read translation files.' }, { status: 500 });
    }
};

export const Route = createFileRoute('/api/translations/files')({ server: { handlers: { GET: () => GET() } } });

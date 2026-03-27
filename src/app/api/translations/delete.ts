import '@tanstack/react-start/server-only';

import { createFileRoute } from '@tanstack/react-router';

import { deleteTranslationFileResponse } from '@/lib/app-services';
import { MissingPathConfigError } from '@/lib/data-paths';

export const DELETE = async (request: Request) => {
    try {
        const url = new URL(request.url);
        const relativePath = url.searchParams.get('path')?.trim();

        if (!relativePath?.endsWith('.json')) {
            return Response.json({ error: 'Invalid file path.' }, { status: 400 });
        }

        return Response.json(await deleteTranslationFileResponse(relativePath));
    } catch (error) {
        if (error instanceof MissingPathConfigError) {
            return Response.json({ error: error.message, key: error.key }, { status: 400 });
        }

        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return Response.json({ error: 'File not found.' }, { status: 404 });
        }

        return Response.json({ error: 'Failed to delete file.' }, { status: 500 });
    }
};

export const Route = createFileRoute('/api/translations/delete')({
    server: { handlers: { DELETE: ({ request }) => DELETE(request) } },
});

import '@tanstack/react-start/server-only';

import { createFileRoute } from '@tanstack/react-router';

import { getPromptStateResponse, setPromptStateResponse } from '@/lib/app-services';
import { MissingPathConfigError } from '@/lib/data-paths';
import { getErrorMessage } from '@/lib/error-utils';

export const GET = async () => {
    try {
        return Response.json(await getPromptStateResponse());
    } catch (error) {
        if (error instanceof MissingPathConfigError) {
            return Response.json({ error: error.message, key: error.key }, { status: 400 });
        }

        return Response.json({ error: 'Failed to load prompt state.' }, { status: 500 });
    }
};

export const POST = async (request: Request) => {
    try {
        const body = (await request.json()) as { content?: string; promptId?: string };
        const content = typeof body.content === 'string' ? body.content : null;
        const promptId = body.promptId?.trim();

        if (!promptId) {
            return Response.json({ error: 'promptId is required.' }, { status: 400 });
        }

        if (content === null) {
            return Response.json({ error: 'content is required.' }, { status: 400 });
        }

        return Response.json(await setPromptStateResponse(promptId, content));
    } catch (error) {
        if (error instanceof MissingPathConfigError) {
            return Response.json({ error: error.message, key: error.key }, { status: 400 });
        }

        return Response.json({ error: getErrorMessage(error, 'Failed to set prompt.') }, { status: 500 });
    }
};

export const Route = createFileRoute('/api/compilation/prompt')({
    server: { handlers: { GET: () => GET(), POST: ({ request }) => POST(request) } },
});

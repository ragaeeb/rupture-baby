import '@tanstack/react-start/server-only';

import { createFileRoute } from '@tanstack/react-router';
import type { LLMProvider } from 'bitaboom';

import { MissingPathConfigError } from '@/lib/data-paths';
import { getShiftCache } from '@/lib/shift-cache';
import { saveShiftCheckpoint } from '@/lib/shift-cache';
import { buildShiftPayload, shiftFirstN } from '@/lib/shift-payload';

export const GET = async (request: Request) => {
    try {
        const { searchParams } = new URL(request.url);
        const maxTokens = Number.parseInt(searchParams.get('maxTokens') as string, 10);
        const provider = searchParams.get('provider') as LLMProvider;

        const shiftCache = await getShiftCache();
        const result = buildShiftPayload({
            excerpts: shiftCache.queue,
            maxTokens,
            prompt: shiftCache.prompt,
            provider,
        });

        const shiftedExcerpts = shiftFirstN(shiftCache.queue, result.shiftCount);
        const shiftedIds = shiftedExcerpts.map((excerpt) => excerpt.id);
        shiftCache.shiftedCount += shiftedExcerpts.length;
        shiftCache.shiftedIds = [...new Set([...shiftCache.shiftedIds, ...shiftedIds])];
        await saveShiftCheckpoint(shiftCache.filePath, shiftCache.mtimeMs, shiftCache.shiftedCount, shiftCache.shiftedIds);

        return new Response(result.payload, { headers: { 'content-type': 'text/plain; charset=utf-8' }, status: 200 });
    } catch (error) {
        if (error instanceof MissingPathConfigError) {
            return Response.json({ error: error.message, key: error.key }, { status: 400 });
        }

        return Response.json({ error: 'Failed to build shift payload.' }, { status: 500 });
    }
};

export const Route = createFileRoute('/api/compilation/excerpts/shift')({
    server: { handlers: { GET: ({ request }) => GET(request) } },
});

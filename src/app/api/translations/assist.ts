import '@tanstack/react-start/server-only';

import { createFileRoute } from '@tanstack/react-router';

import { requestTranslationAssistResponse } from '@/lib/app-services';
import type { TranslationAssistRequest } from '@/lib/shell-types';

const isValidAssistRequest = (value: unknown): value is TranslationAssistRequest => {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const candidate = value as Partial<TranslationAssistRequest>;

    return (
        (typeof candidate.providerId === 'undefined' ||
            candidate.providerId === 'hf' ||
            candidate.providerId === 'gemini' ||
            candidate.providerId === 'cloudflare') &&
        (candidate.scope === 'file' || candidate.scope === 'batch') &&
        candidate.task === 'arabic_leak_correction' &&
        Array.isArray(candidate.excerpts) &&
        candidate.excerpts.length > 0 &&
        candidate.excerpts.every(
            (excerpt) =>
                typeof excerpt === 'object' &&
                excerpt !== null &&
                typeof excerpt.id === 'string' &&
                excerpt.id.trim().length > 0 &&
                typeof excerpt.filePath === 'string' &&
                excerpt.filePath.trim().length > 0 &&
                typeof excerpt.arabic === 'string' &&
                excerpt.arabic.trim().length > 0 &&
                typeof excerpt.translation === 'string',
        )
    );
};

export const POST = async (request: Request) => {
    try {
        const body = (await request.json()) as unknown;
        if (!isValidAssistRequest(body)) {
            return Response.json(
                {
                    error: 'Invalid translation assist request. Expected { providerId?: "hf" | "gemini" | "cloudflare", scope: "file" | "batch", task: "arabic_leak_correction", excerpts: [{ filePath, id, arabic, translation }] }.',
                },
                { status: 400 },
            );
        }

        return Response.json(await requestTranslationAssistResponse(body));
    } catch (error) {
        if (error instanceof Error) {
            return Response.json({ error: error.message }, { status: 500 });
        }

        return Response.json({ error: 'Failed to request translation assistance.' }, { status: 500 });
    }
};

export const Route = createFileRoute('/api/translations/assist')({
    server: { handlers: { POST: ({ request }) => POST(request) } },
});

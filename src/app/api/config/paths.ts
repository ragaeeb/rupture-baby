import '@tanstack/react-start/server-only';

import { createFileRoute } from '@tanstack/react-router';

import { getCompilationSelectionState } from '@/lib/compilation-selection';

export const GET = async () => {
    const compilationSelection = await getCompilationSelectionState().catch(() => null);

    return Response.json({
        activeCompilationFilePath: compilationSelection?.activeFilePath ?? null,
        compilationFolder: process.env.COMPILATION_FOLDER?.trim() || null,
        translationsDir: process.env.TRANSLATIONS_DIR?.trim() || null,
    });
};

export const POST = async () =>
    Response.json(
        {
            error: 'Runtime path updates are disabled. Configure COMPILATION_FOLDER and TRANSLATIONS_DIR via environment.',
        },
        { status: 400 },
    );

export const Route = createFileRoute('/api/config/paths')({
    server: { handlers: { GET: () => GET(), POST: () => POST() } },
});

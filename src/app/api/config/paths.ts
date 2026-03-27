import '@tanstack/react-start/server-only';

import { createFileRoute } from '@tanstack/react-router';

export const GET = async () =>
    Response.json({
        compilationFilePath: process.env.COMPILATION_FILE_PATH?.trim() || null,
        translationsDir: process.env.TRANSLATIONS_DIR?.trim() || null,
    });

export const POST = async () =>
    Response.json(
        {
            error: 'Runtime path updates are disabled. Configure COMPILATION_FILE_PATH and TRANSLATIONS_DIR via environment.',
        },
        { status: 400 },
    );

export const Route = createFileRoute('/api/config/paths')({
    server: { handlers: { GET: () => GET(), POST: () => POST() } },
});

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = async () =>
    NextResponse.json({
        compilationFilePath: process.env.COMPILATION_FILE_PATH?.trim() || null,
        translationsDir: process.env.TRANSLATIONS_DIR?.trim() || null,
    });

export const POST = async () =>
    NextResponse.json(
        {
            error: 'Runtime path updates are disabled. Configure COMPILATION_FILE_PATH and TRANSLATIONS_DIR via environment.',
        },
        { status: 400 },
    );

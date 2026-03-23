import { NextResponse } from 'next/server';

import { MissingPathConfigError } from '@/lib/data-paths';
import { readTranslationJsonFile } from '@/lib/translations-browser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = async (request: Request) => {
    const url = new URL(request.url);
    const filePath = url.searchParams.get('path')?.trim();

    if (!filePath) {
        return NextResponse.json({ error: 'Query parameter "path" is required.' }, { status: 400 });
    }

    try {
        const file = await readTranslationJsonFile(filePath);
        return NextResponse.json(file);
    } catch (error) {
        if (error instanceof MissingPathConfigError) {
            return NextResponse.json({ error: error.message, key: error.key }, { status: 400 });
        }

        if (error instanceof SyntaxError) {
            return NextResponse.json({ error: 'Translation file is not valid JSON.' }, { status: 422 });
        }

        if (error instanceof Error) {
            return NextResponse.json({ error: error.message }, { status: 404 });
        }

        return NextResponse.json({ error: 'Failed to read translation file.' }, { status: 500 });
    }
};

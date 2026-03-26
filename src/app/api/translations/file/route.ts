import { NextResponse } from 'next/server';

import { MissingPathConfigError } from '@/lib/data-paths';
import { isRupturePatch } from '@/lib/translation-patches';
import { readTranslationJsonFile, writeTranslationPatch } from '@/lib/translations-browser';

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

export const PATCH = async (request: Request) => {
    const url = new URL(request.url);
    const filePath = url.searchParams.get('path')?.trim();

    if (!filePath) {
        return NextResponse.json({ error: 'Query parameter "path" is required.' }, { status: 400 });
    }

    try {
        const body = (await request.json()) as unknown;
        if (typeof body !== 'object' || body === null) {
            return NextResponse.json({ error: 'Request body must be a JSON object.' }, { status: 400 });
        }

        const { excerptId, patch } = body as { excerptId?: unknown; patch?: unknown };
        if (typeof excerptId !== 'string' || excerptId.trim().length === 0) {
            return NextResponse.json({ error: 'Field "excerptId" is required.' }, { status: 400 });
        }
        if (patch !== null && !isRupturePatch(patch)) {
            return NextResponse.json({ error: 'Field "patch" must be a patch object or null.' }, { status: 400 });
        }

        const file = await writeTranslationPatch(filePath, excerptId.trim(), patch);
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

        return NextResponse.json({ error: 'Failed to update translation patch.' }, { status: 500 });
    }
};

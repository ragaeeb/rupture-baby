import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

import { MissingPathConfigError, requireTranslationsDir } from '@/lib/data-paths';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export const POST = async (request: Request, context: RouteContext) => {
    try {
        const { id } = await context.params;
        const rawConversation = await request.text();

        const outputDir = requireTranslationsDir();
        await mkdir(outputDir, { recursive: true });

        const outputPath = path.join(outputDir, `${id}.json`);
        await Bun.write(outputPath, rawConversation);
        return NextResponse.json({ id, path: outputPath, saved: true });
    } catch (error) {
        if (error instanceof MissingPathConfigError) {
            return NextResponse.json({ error: error.message, key: error.key }, { status: 400 });
        }
        return NextResponse.json({ error: 'Failed to save translation.' }, { status: 500 });
    }
};

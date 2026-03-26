import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

import { MissingPathConfigError, requireTranslationsDir } from '@/lib/data-paths';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const DELETE = async (request: Request) => {
    try {
        const url = new URL(request.url);
        const relativePath = url.searchParams.get('path')?.trim();

        if (!relativePath || !relativePath.endsWith('.json')) {
            return NextResponse.json({ error: 'Invalid file path.' }, { status: 400 });
        }

        const translationsDir = requireTranslationsDir();
        const fullPath = path.join(translationsDir, relativePath);

        // Security check: ensure path is within translations directory
        const resolvedFull = path.resolve(fullPath);
        const resolvedDir = path.resolve(translationsDir);
        if (!resolvedFull.startsWith(resolvedDir)) {
            return NextResponse.json({ error: 'Invalid file path.' }, { status: 400 });
        }

        await unlink(fullPath);

        return NextResponse.json({ success: true, deletedPath: relativePath });
    } catch (error) {
        if (error instanceof MissingPathConfigError) {
            return NextResponse.json({ error: error.message, key: error.key }, { status: 400 });
        }

        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return NextResponse.json({ error: 'File not found.' }, { status: 404 });
        }

        return NextResponse.json({ error: 'Failed to delete file.' }, { status: 500 });
    }
};

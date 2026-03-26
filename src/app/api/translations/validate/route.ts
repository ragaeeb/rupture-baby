import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

import { MissingPathConfigError, requireTranslationsDir } from '@/lib/data-paths';
import { parseTranslationToCommon, mapConversationToExcerpts } from '@/lib/translation-parser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const collectJsonFiles = async (dir: string, relativePath = ''): Promise<string[]> => {
    const files: string[] = [];
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
            files.push(...(await collectJsonFiles(fullPath, relPath)));
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
            files.push(relPath);
        }
    }

    return files;
};

const validateFile = async (translationsDir: string, filePath: string): Promise<boolean> => {
    try {
        const fullPath = path.join(translationsDir, filePath);
        const file = Bun.file(fullPath);
        const content = await file.text();
        const parsed = parseTranslationToCommon(JSON.parse(content));
        const excerpts = mapConversationToExcerpts(parsed);
        return excerpts.length === 0;
    } catch {
        // If parsing fails, mark as invalid
        return true;
    }
};

export const GET = async () => {
    try {
        const translationsDir = requireTranslationsDir();
        const filePaths = await collectJsonFiles(translationsDir);

        const invalidFiles: string[] = [];

        for (const filePath of filePaths) {
            const isInvalid = await validateFile(translationsDir, filePath);
            if (isInvalid) {
                invalidFiles.push(filePath);
            }
        }

        return NextResponse.json({
            totalFiles: filePaths.length,
            invalidCount: invalidFiles.length,
            invalidFiles,
        });
    } catch (error) {
        if (error instanceof MissingPathConfigError) {
            return NextResponse.json({ error: error.message, key: error.key }, { status: 400 });
        }

        return NextResponse.json({ error: 'Failed to validate translations.' }, { status: 500 });
    }
};

import '@tanstack/react-start/server-only';

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { createFileRoute } from '@tanstack/react-router';

import { MissingPathConfigError, requireTranslationsDir } from '@/lib/data-paths';
import { readTextFile } from '@/lib/runtime-files';
import { analyzeTranslationValidity, isTranslationValidityAnalysisInvalid } from '@/lib/translation-validity';

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
        const content = await readTextFile(fullPath);
        const analysis = analyzeTranslationValidity(content);
        return isTranslationValidityAnalysisInvalid(analysis);
    } catch {
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

        return Response.json({ invalidCount: invalidFiles.length, invalidFiles, totalFiles: filePaths.length });
    } catch (error) {
        if (error instanceof MissingPathConfigError) {
            return Response.json({ error: error.message, key: error.key }, { status: 400 });
        }

        return Response.json({ error: 'Failed to validate translations.' }, { status: 500 });
    }
};

export const Route = createFileRoute('/api/translations/validate')({ server: { handlers: { GET: () => GET() } } });

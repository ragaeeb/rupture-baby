import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createRupturePatch, type RupturePatchMetadata } from '@/lib/translation-patches';

import { GET, PATCH } from './file';

describe('translation file api route', () => {
    let tempDir = '';
    let translationsDir = '';
    let relativePath = '';

    const createPatchMetadata = (): RupturePatchMetadata => ({
        appliedAt: '2026-05-02T00:00:00.000Z',
        highlightRanges: [{ end: 4, start: 0 }],
        source: {
            kind: 'llm',
            model: 'z-ai/glm4.7',
            provider: 'nvidia',
            task: 'arabic_leak_correction',
        },
    });

    const createTranslationFile = async (content: string) => {
        await writeFile(path.join(translationsDir, relativePath), content);
    };

    beforeEach(async () => {
        tempDir = await mkdtemp(path.join(os.tmpdir(), 'rupture-translation-file-route-'));
        translationsDir = path.join(tempDir, 'translations');
        relativePath = 'sample.json';
        await mkdir(translationsDir, { recursive: true });
        process.env.TRANSLATIONS_DIR = translationsDir;
    });

    afterEach(async () => {
        delete process.env.TRANSLATIONS_DIR;
        if (tempDir) {
            await rm(tempDir, { force: true, recursive: true });
        }
    });

    it('should return 422 when the translation file is not valid json', async () => {
        await createTranslationFile('{not valid json');

        const response = await GET(new Request(`http://localhost/api/translations/file?path=${relativePath}`));
        const json = (await response.json()) as { error: string };

        expect(response.status).toBe(422);
        expect(json.error).toBe('Translation file is not valid JSON.');
    });

    it('should reject invalid patch metadata before touching the file', async () => {
        await createTranslationFile(
            JSON.stringify({
                format: 'common',
                llm: 'ChatGPT',
                model: 'gpt-5-4-pro',
                prompt: 'Translate carefully.\n\nP1 - نص عربي',
                reasoning: [],
                response: 'P1 - first translation',
            }),
        );

        const response = await PATCH(
            new Request(`http://localhost/api/translations/file?path=${relativePath}`, {
                body: JSON.stringify({
                    excerptId: 'P1',
                    patch: null,
                    patchMetadata: { appliedAt: '2026-05-02T00:00:00.000Z', source: { provider: 'bad' } },
                }),
                headers: { 'content-type': 'application/json' },
                method: 'PATCH',
            }),
        );
        if (!response) {
            throw new Error('Expected response');
        }
        const json = (await response.json()) as { error: string };
        const saved = await readFile(path.join(translationsDir, relativePath), 'utf8');

        expect(response.status).toBe(400);
        expect(json.error).toBe('Field "patchMetadata" must be a valid patch metadata object.');
        expect(JSON.parse(saved)).not.toHaveProperty('__rupture');
    });

    it('should persist a valid patch and patch metadata', async () => {
        const patch = createRupturePatch('first translation', 'first translation fixed');
        if (!patch) {
            throw new Error('Expected patch to be created');
        }

        const patchMetadata = createPatchMetadata();
        await createTranslationFile(
            JSON.stringify({
                format: 'common',
                llm: 'ChatGPT',
                model: 'gpt-5-4-pro',
                prompt: 'Translate carefully.\n\nP1 - نص عربي',
                reasoning: [],
                response: 'P1 - first translation',
            }),
        );

        const response = await PATCH(
            new Request(`http://localhost/api/translations/file?path=${relativePath}`, {
                body: JSON.stringify({ excerptId: 'P1', patch, patchMetadata }),
                headers: { 'content-type': 'application/json' },
                method: 'PATCH',
            }),
        );
        if (!response) {
            throw new Error('Expected response');
        }
        const json = (await response.json()) as {
            content: {
                __rupture?: {
                    patchMetadata?: Record<string, RupturePatchMetadata>;
                    patches?: Record<string, typeof patch>;
                };
            };
            relativePath: string;
        };
        const saved = JSON.parse(await readFile(path.join(translationsDir, relativePath), 'utf8')) as {
            __rupture?: {
                patchMetadata?: Record<string, RupturePatchMetadata>;
                patches?: Record<string, typeof patch>;
            };
        };

        expect(response.status).toBe(200);
        expect(json.relativePath).toBe(relativePath);
        expect(json.content.__rupture?.patches).toEqual({ P1: patch });
        expect(json.content.__rupture?.patchMetadata).toEqual({ P1: patchMetadata });
        expect(saved.__rupture?.patches).toEqual({ P1: patch });
        expect(saved.__rupture?.patchMetadata).toEqual({ P1: patchMetadata });
    });
});

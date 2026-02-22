import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { POST } from './route';

describe('POST /api/translations/[id]', () => {
    let tempDir = '';

    beforeEach(async () => {
        tempDir = await mkdtemp(path.join(os.tmpdir(), 'rupture-baby-tests-'));
        delete process.env.TRANSLATIONS_DIR;
    });

    afterEach(async () => {
        delete process.env.TRANSLATIONS_DIR;
        if (tempDir) {
            await rm(tempDir, { force: true, recursive: true });
        }
    });

    it('should return 400 when translations directory is not configured', async () => {
        delete process.env.TRANSLATIONS_DIR;

        const response = await POST(
            new Request('http://localhost/api/translations/1', {
                method: 'POST',
                body: '{"hello":"world"}',
            }),
            { params: Promise.resolve({ id: '1' }) },
        );

        expect(response.status).toBe(400);
    });

    it('should save translation payload to configured directory', async () => {
        process.env.TRANSLATIONS_DIR = tempDir;

        const response = await POST(
            new Request('http://localhost/api/translations/123', {
                method: 'POST',
                body: '{"foo":"bar"}',
            }),
            { params: Promise.resolve({ id: '123' }) },
        );
        const json = (await response.json()) as { id: string; path: string; saved: boolean };
        const content = await readFile(path.join(tempDir, '123.json'), 'utf8');

        expect(response.status).toBe(200);
        expect(json.id).toBe('123');
        expect(json.saved).toBe(true);
        expect(content).toBe('{"foo":"bar"}');
    });

    it('should create the translations directory when it does not exist', async () => {
        const nestedDir = path.join(tempDir, 'nested', 'translations');
        process.env.TRANSLATIONS_DIR = nestedDir;

        const response = await POST(
            new Request('http://localhost/api/translations/456', {
                method: 'POST',
                body: '{"nested":"ok"}',
            }),
            { params: Promise.resolve({ id: '456' }) },
        );
        const json = (await response.json()) as { saved: boolean };
        const content = await readFile(path.join(nestedDir, '456.json'), 'utf8');

        expect(response.status).toBe(200);
        expect(json.saved).toBe(true);
        expect(content).toBe('{"nested":"ok"}');
    });
});

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

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
            new Request('http://localhost/api/translations/1', { body: '{"hello":"world"}', method: 'POST' }),
            { params: Promise.resolve({ id: '1' }) },
        );

        expect(response.status).toBe(400);
    });

    it('should save translation payload to configured directory', async () => {
        process.env.TRANSLATIONS_DIR = tempDir;

        const response = await POST(
            new Request('http://localhost/api/translations/123', { body: '{"foo":"bar"}', method: 'POST' }),
            { params: Promise.resolve({ id: '123' }) },
        );
        const json = (await response.json()) as {
            id: string;
            path: string;
            saved: boolean;
            duplicate: boolean;
            blackiyaSeq: number | null;
            blackiyaCreatedAt: number | null;
        };
        const content = await readFile(path.join(tempDir, '123.json'), 'utf8');

        expect(response.status).toBe(200);
        expect(json.id).toBe('123');
        expect(json.saved).toBe(true);
        expect(json.duplicate).toBe(false);
        expect(content).toBe('{"foo":"bar"}');
    });

    it('should create the translations directory when it does not exist', async () => {
        const nestedDir = path.join(tempDir, 'nested', 'translations');
        process.env.TRANSLATIONS_DIR = nestedDir;

        const response = await POST(
            new Request('http://localhost/api/translations/456', { body: '{"nested":"ok"}', method: 'POST' }),
            { params: Promise.resolve({ id: '456' }) },
        );
        const json = (await response.json()) as { saved: boolean; duplicate: boolean };
        const content = await readFile(path.join(nestedDir, '456.json'), 'utf8');

        expect(response.status).toBe(200);
        expect(json.saved).toBe(true);
        expect(json.duplicate).toBe(false);
        expect(content).toBe('{"nested":"ok"}');
    });

    it('should return 409 duplicate for repeated idempotency key and keep first payload', async () => {
        process.env.TRANSLATIONS_DIR = tempDir;

        const firstResponse = await POST(
            new Request('http://localhost/api/translations/789', {
                body: '{"first":"payload"}',
                headers: {
                    'X-Blackiya-Created-At': '1710000000000',
                    'X-Blackiya-Seq': '15',
                    'X-Idempotency-Key': 'evt-123',
                },
                method: 'POST',
            }),
            { params: Promise.resolve({ id: '789' }) },
        );

        const duplicateResponse = await POST(
            new Request('http://localhost/api/translations/789', {
                body: '{"second":"payload"}',
                headers: {
                    'X-Blackiya-Created-At': '1710000000000',
                    'X-Blackiya-Seq': '15',
                    'X-Idempotency-Key': 'evt-123',
                },
                method: 'POST',
            }),
            { params: Promise.resolve({ id: '789' }) },
        );

        const firstJson = (await firstResponse.json()) as { duplicate: boolean };
        const duplicateJson = (await duplicateResponse.json()) as {
            duplicate: boolean;
            saved: boolean;
            blackiyaSeq: number | null;
            blackiyaCreatedAt: number | null;
        };

        const content = await readFile(path.join(tempDir, '789.json'), 'utf8');
        const metaRaw = await readFile(path.join(tempDir, '789.meta.json'), 'utf8');
        const meta = JSON.parse(metaRaw) as {
            idempotencyKey: string | null;
            blackiyaSeq: number | null;
            blackiyaCreatedAt: number | null;
        };

        expect(firstResponse.status).toBe(200);
        expect(firstJson.duplicate).toBe(false);
        expect(duplicateResponse.status).toBe(409);
        expect(duplicateJson.duplicate).toBe(true);
        expect(duplicateJson.saved).toBe(true);
        expect(content).toBe('{"first":"payload"}');
        expect(meta.idempotencyKey).toBe('evt-123');
        expect(meta.blackiyaSeq).toBe(15);
        expect(meta.blackiyaCreatedAt).toBe(1710000000000);
    });

    it('should skip stale writes when incoming seq is older than saved seq', async () => {
        process.env.TRANSLATIONS_DIR = tempDir;

        const firstResponse = await POST(
            new Request('http://localhost/api/translations/seq-test', {
                body: '{"value":"newer"}',
                headers: { 'X-Blackiya-Created-At': '1710000000500', 'X-Blackiya-Seq': '50' },
                method: 'POST',
            }),
            { params: Promise.resolve({ id: 'seq-test' }) },
        );
        expect(firstResponse.status).toBe(200);

        const staleResponse = await POST(
            new Request('http://localhost/api/translations/seq-test', {
                body: '{"value":"older"}',
                headers: { 'X-Blackiya-Created-At': '1710000000490', 'X-Blackiya-Seq': '49' },
                method: 'POST',
            }),
            { params: Promise.resolve({ id: 'seq-test' }) },
        );
        const staleJson = (await staleResponse.json()) as { stale?: boolean; blackiyaSeq: number | null };
        const content = await readFile(path.join(tempDir, 'seq-test.json'), 'utf8');
        const metaRaw = await readFile(path.join(tempDir, 'seq-test.meta.json'), 'utf8');
        const meta = JSON.parse(metaRaw) as { blackiyaSeq: number | null };

        expect(staleResponse.status).toBe(200);
        expect(staleJson.stale).toBe(true);
        expect(staleJson.blackiyaSeq).toBe(50);
        expect(content).toBe('{"value":"newer"}');
        expect(meta.blackiyaSeq).toBe(50);
    });
});

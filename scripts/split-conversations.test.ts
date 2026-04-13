import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

describe('split-conversations script', () => {
    let tempDir = '';

    beforeEach(async () => {
        tempDir = await mkdtemp(path.join(os.tmpdir(), 'rupture-split-conversations-'));
    });

    afterEach(async () => {
        if (tempDir) {
            await rm(tempDir, { force: true, recursive: true });
        }
    });

    it('should unzip nested export archives and split prod-grok-backend.json into the translations root', async () => {
        const translationsDir = path.join(tempDir, 'translations');
        const archiveRoot = path.join(tempDir, 'ttl', '30d', 'export_data', '123e4567');
        const prodFilePath = path.join(archiveRoot, 'prod-grok-backend.json');
        const archivePath = path.join(translationsDir, 'account-export.zip');

        await mkdir(archiveRoot, { recursive: true });
        await mkdir(translationsDir, { recursive: true });
        await writeFile(
            prodFilePath,
            JSON.stringify(
                {
                    conversations: [
                        {
                            conversation: {
                                create_time: '2026-04-07T00:00:00.000Z',
                                id: 'conv-1',
                                modify_time: '2026-04-07T00:00:00.000Z',
                                title: 'First conversation',
                            },
                            responses: [],
                        },
                        {
                            conversation: {
                                create_time: '2026-04-07T00:00:00.000Z',
                                id: 'conv-2',
                                modify_time: '2026-04-07T00:00:00.000Z',
                                title: 'Second conversation',
                            },
                            responses: [],
                        },
                    ],
                },
                null,
                2,
            ),
        );

        await execFileAsync('zip', ['-q', '-r', archivePath, 'ttl'], { cwd: tempDir });

        const { stdout, stderr } = await execFileAsync('bun', ['run', 'scripts/split-conversations.ts', '--write'], {
            cwd: '/Users/rhaq/workspace/rupture-baby',
            env: { ...process.env, TRANSLATIONS_DIR: translationsDir },
        });

        expect(stderr).toBe('');
        expect(stdout).toContain('account-export.zip');

        const firstOutput = JSON.parse(await readFile(path.join(translationsDir, 'conv-1.json'), 'utf8')) as {
            conversation: { id: string };
        };
        const secondOutput = JSON.parse(await readFile(path.join(translationsDir, 'conv-2.json'), 'utf8')) as {
            conversation: { id: string };
        };

        expect(firstOutput.conversation.id).toBe('conv-1');
        expect(secondOutput.conversation.id).toBe('conv-2');
    });
});

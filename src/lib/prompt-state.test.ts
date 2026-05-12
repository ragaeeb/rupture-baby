import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
    __resetCompilationSnapshotForTests,
    getCompilationSnapshot,
    getCompilationSnapshotPath,
    invalidateCompilationSnapshot,
} from './compilation-cache';
import { setSelectedPrompt } from './prompt-state';
import { nowInSeconds } from './time';

describe('setSelectedPrompt', () => {
    let compilationFilePath = '';
    let tempDir = '';

    beforeEach(async () => {
        tempDir = await mkdtemp(path.join(os.tmpdir(), 'rupture-prompt-state-'));
        compilationFilePath = path.join(tempDir, 'compilation.json');
        process.env.COMPILATION_FOLDER = tempDir;
        invalidateCompilationSnapshot();
        __resetCompilationSnapshotForTests();

        await writeFile(
            compilationFilePath,
            JSON.stringify({
                contractVersion: '1',
                createdAt: 1_770_000_000,
                excerpts: [],
                footnotes: [],
                headings: [],
                lastUpdatedAt: 1_770_000_001,
                options: {},
                postProcessingApps: [],
                promptForTranslation: 'old prompt',
                promptId: 'OLD_PROMPT',
            }),
        );
    });

    afterEach(async () => {
        delete process.env.COMPILATION_FOLDER;
        invalidateCompilationSnapshot();
        __resetCompilationSnapshotForTests();
        if (tempDir) {
            await rm(tempDir, { force: true, recursive: true });
        }
    });

    it('should write prompt updates with unix-second timestamps and clear the stale snapshot sidecar', async () => {
        await getCompilationSnapshot();
        const snapshotPath = getCompilationSnapshotPath(compilationFilePath);
        await access(snapshotPath);

        const startedAt = nowInSeconds();
        await setSelectedPrompt({ content: 'new prompt body', promptId: 'FATAWA' });

        const saved = JSON.parse(await readFile(compilationFilePath, 'utf8')) as {
            lastUpdatedAt: number;
            promptForTranslation: string;
            promptId: string;
        };

        expect(saved.promptForTranslation).toBe('new prompt body');
        expect(saved.promptId).toBe('FATAWA');
        expect(saved.lastUpdatedAt).toBeGreaterThanOrEqual(startedAt);
        expect(saved.lastUpdatedAt).toBeLessThan(startedAt + 5);

        let snapshotExists = true;
        try {
            await access(snapshotPath);
        } catch {
            snapshotExists = false;
        }

        expect(snapshotExists).toBe(false);
    });
});

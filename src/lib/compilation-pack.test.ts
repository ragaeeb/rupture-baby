import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { getPackedCompilationFilePath, packCompilationFile } from './compilation-pack';

describe('packCompilationFile', () => {
    let tempDir = '';
    let compilationFilePath = '';

    beforeEach(async () => {
        tempDir = await mkdtemp(path.join(os.tmpdir(), 'rupture-compilation-pack-'));
        compilationFilePath = path.join(tempDir, '1119.json');
        await writeFile(compilationFilePath, JSON.stringify({ excerpts: [{ id: 'P1', nass: 'نص', text: 'Text' }] }));
    });

    afterEach(async () => {
        if (tempDir) {
            await rm(tempDir, { force: true, recursive: true });
        }
    });

    it('should write a maximum-compression brotli archive beside the compilation json file', async () => {
        const observedCalls: Array<{ args: string[]; command: string }> = [];

        const result = await packCompilationFile({
            compilationFilePath,
            runCommand: async (command, args) => {
                observedCalls.push({ args, command });
                await writeFile(getPackedCompilationFilePath(compilationFilePath), 'packed');
            },
        });

        expect(observedCalls).toEqual([
            {
                args: ['--force', '--quality=11', '--lgwin=24', `--output=${compilationFilePath}.br`, compilationFilePath],
                command: 'brotli',
            },
        ]);
        expect(result.outputPath).toBe(`${compilationFilePath}.br`);
        expect(result.sourcePath).toBe(compilationFilePath);
        expect(result.sizeBytes).toBeGreaterThan(0);
        expect(result.compressedSizeBytes).toBeGreaterThan(0);
    });
});

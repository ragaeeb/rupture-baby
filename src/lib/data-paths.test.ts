import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
    getActiveCompilationConfigPath,
    listCompilationFileOptions,
    requireCompilationFilePath,
    setActiveCompilationFileName,
} from './data-paths';

describe('data-paths compilation selection', () => {
    let tempDir = '';

    beforeEach(async () => {
        tempDir = await mkdtemp(path.join(os.tmpdir(), 'rupture-baby-data-paths-'));
        process.env.COMPILATION_FOLDER = tempDir;
    });

    afterEach(async () => {
        delete process.env.COMPILATION_FOLDER;
        if (tempDir) {
            await rm(tempDir, { force: true, recursive: true });
        }
    });

    it('should ignore hidden sidecar json files when listing compilations', async () => {
        await Promise.all([
            writeFile(path.join(tempDir, '1119.json'), '{}'),
            writeFile(path.join(tempDir, '2220.json'), '{}'),
            writeFile(path.join(tempDir, '.1119.settings.json'), '{}'),
            writeFile(path.join(tempDir, '.1119.stats-cache.json'), '{}'),
            writeFile(path.join(tempDir, '.1119.compilation-cache.json'), '{}'),
        ]);

        const options = await listCompilationFileOptions();

        expect(options.map((option) => option.fileName)).toEqual(['1119.json', '2220.json']);
    });

    it('should persist the selected active compilation inside the folder', async () => {
        await Promise.all([
            writeFile(path.join(tempDir, '1119.json'), '{}'),
            writeFile(path.join(tempDir, '2220.json'), '{}'),
        ]);

        await setActiveCompilationFileName('2220.json');

        expect(await requireCompilationFilePath()).toBe(path.join(tempDir, '2220.json'));
        expect(await Bun.file(getActiveCompilationConfigPath(tempDir)).json()).toEqual({
            fileName: '2220.json',
            version: 1,
        });
    });

    it('should fall back to the first visible compilation when no selection exists', async () => {
        await Promise.all([
            writeFile(path.join(tempDir, '3330.json'), '{}'),
            writeFile(path.join(tempDir, '1119.json'), '{}'),
        ]);

        expect(await requireCompilationFilePath()).toBe(path.join(tempDir, '1119.json'));
    });
});

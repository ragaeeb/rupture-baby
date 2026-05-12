import '@tanstack/react-start/server-only';

import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { promisify } from 'node:util';

import { requireCompilationFilePath } from './data-paths';

const execFileAsync = promisify(execFile);

type RunCommand = (command: string, args: string[]) => Promise<void>;

const runCommand: RunCommand = async (command, args) => {
    await execFileAsync(command, args);
};

export const getPackedCompilationFilePath = (compilationFilePath: string) => `${compilationFilePath}.br`;

export const packCompilationFile = async ({
    compilationFilePath,
    runCommand: executeCommand = runCommand,
}: {
    compilationFilePath?: string;
    runCommand?: RunCommand;
} = {}) => {
    const resolvedCompilationFilePath = compilationFilePath ?? (await requireCompilationFilePath());
    const outputPath = getPackedCompilationFilePath(resolvedCompilationFilePath);

    await executeCommand('brotli', [
        '--force',
        '--quality=11',
        '--lgwin=24',
        `--output=${outputPath}`,
        resolvedCompilationFilePath,
    ]);

    const [sourceStats, outputStats] = await Promise.all([stat(resolvedCompilationFilePath), stat(outputPath)]);

    return {
        compressedSizeBytes: outputStats.size,
        outputPath,
        sizeBytes: sourceStats.size,
        sourcePath: resolvedCompilationFilePath,
    };
};

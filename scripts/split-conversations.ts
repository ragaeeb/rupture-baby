/**
 * Split multi-conversation Grok export files into individual conversation files.
 *
 * Usage:
 *   bun run scripts/split-conversations.ts [--write]
 *
 * Options:
 *   --write    Actually perform the split (default is dry-run)
 */

import { execFile } from 'node:child_process';
import { readdir, rm, writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

type GrokMassExport = {
    conversations: Array<{
        conversation: { id: string; title: string; create_time: string; modify_time: string };
        responses: Array<{ response: { _id: string; conversation_id: string; message: string } }>;
    }>;
};

const TRANSLATIONS_DIR = process.env.TRANSLATIONS_DIR || path.join(process.cwd(), 'translations');
const execFileAsync = promisify(execFile);

const isGrokMassExport = (data: unknown): data is GrokMassExport => {
    if (typeof data !== 'object' || data === null) {
        return false;
    }
    const obj = data as Record<string, unknown>;
    if (!Array.isArray(obj.conversations)) {
        return false;
    }

    // Verify structure
    for (const conv of obj.conversations) {
        if (typeof conv !== 'object' || conv === null) {
            return false;
        }
        const convObj = conv as Record<string, unknown>;
        if (typeof convObj.conversation !== 'object' || convObj.conversation === null) {
            return false;
        }
        const conversation = convObj.conversation as Record<string, unknown>;
        if (typeof conversation.id !== 'string') {
            return false;
        }
    }
    return true;
};

type SplitResult = {
    conversations?: Array<{ id: string; outputPath: string; title: string }>;
    originalFile: string;
    reason?: string;
    split: boolean;
};

const findCandidateFiles = async (dir: string): Promise<string[]> => {
    const files: string[] = [];
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await findCandidateFiles(fullPath)));
        } else if (entry.isFile() && (entry.name.endsWith('.json') || entry.name.endsWith('.zip'))) {
            files.push(fullPath);
        }
    }

    return files;
};

const unzipArchive = async (archivePath: string, destinationDir: string) => {
    await execFileAsync('unzip', ['-oq', archivePath, '-d', destinationDir]);
};

const findNamedFiles = async (dir: string, fileName: string): Promise<string[]> => {
    const matches: string[] = [];
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            matches.push(...(await findNamedFiles(fullPath, fileName)));
            continue;
        }

        if (entry.isFile() && entry.name === fileName) {
            matches.push(fullPath);
        }
    }

    return matches;
};

const splitConversations = async (filePath: string, dryRun: boolean, outputDir = path.dirname(filePath)) => {
    const data = await Bun.file(filePath).json();

    if (!isGrokMassExport(data)) {
        return { originalFile: filePath, reason: 'Not a multi-conversation file', split: false };
    }

    const results: Array<{ id: string; title: string; outputPath: string }> = [];

    for (const conv of data.conversations) {
        const convId = conv.conversation.id;
        const title = conv.conversation.title || 'Untitled';
        const outputPath = path.join(outputDir, `${convId}.json`);

        // Create single conversation file - output the conversation object directly
        if (!dryRun) {
            await rm(outputPath, { force: true });
            await writeFile(outputPath, JSON.stringify(conv, null, 2), 'utf8');
        }

        results.push({ id: convId, outputPath, title });
    }

    if (!dryRun) {
        await rm(filePath);
    }

    return { conversations: results, originalFile: filePath, split: true };
};

const splitZipArchive = async (archivePath: string, dryRun: boolean) => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'split-conversations-'));

    try {
        await unzipArchive(archivePath, tempDir);
        const prodFiles = await findNamedFiles(tempDir, 'prod-grok-backend.json');

        if (prodFiles.length === 0) {
            return { originalFile: archivePath, reason: 'No prod-grok-backend.json found in archive', split: false };
        }

        const conversations: Array<{ id: string; outputPath: string; title: string }> = [];

        for (const prodFile of prodFiles) {
            const result = await splitConversations(prodFile, dryRun, TRANSLATIONS_DIR);
            if (result.split && result.conversations) {
                conversations.push(...result.conversations);
            }
        }

        if (!dryRun && conversations.length > 0) {
            await rm(archivePath, { force: true });
        }

        return conversations.length > 0
            ? { conversations, originalFile: archivePath, split: true }
            : { originalFile: archivePath, reason: 'prod-grok-backend.json was not a multi-conversation file', split: false };
    } finally {
        await rm(tempDir, { force: true, recursive: true });
    }
};

const run = async () => {
    const args = process.argv.slice(2);
    const writeMode = args.includes('--write');

    console.log(`Scanning: ${TRANSLATIONS_DIR}`);
    console.log(`Mode: ${writeMode ? 'WRITE' : 'DRY-RUN'}\n`);

    const candidateFiles = await findCandidateFiles(TRANSLATIONS_DIR);
    console.log(`Found ${candidateFiles.length} candidate files\n`);

    let splitCount = 0;
    let totalNewFiles = 0;

    for (const file of candidateFiles) {
        try {
            const result = file.endsWith('.zip') ? await splitZipArchive(file, !writeMode) : await splitConversations(file, !writeMode);

            if (result.split && result.conversations) {
                splitCount += 1;
                totalNewFiles += result.conversations.length;

                if (writeMode) {
                    console.log(`✓ Split: ${path.basename(file)}`);
                    for (const conv of result.conversations) {
                        console.log(`    → ${conv.id}.json (${conv.title.slice(0, 50)}...)`);
                    }
                } else {
                    console.log(`Would split: ${path.basename(file)} (${result.conversations.length} conversations)`);
                    for (const conv of result.conversations) {
                        console.log(`    → ${conv.id}.json (${conv.title.slice(0, 50)}...)`);
                    }
                }
            }
        } catch (error) {
            console.error(`Error processing ${file}:`, error instanceof Error ? error.message : String(error));
        }
    }

    console.log('\n--- Summary ---');
    console.log(`Files to split: ${splitCount}`);
    console.log(`New files created: ${totalNewFiles}`);

    if (!writeMode) {
        console.log('\nRun with --write to apply changes.');
    }
};

run().catch((error: unknown) => {
    console.error('Script failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
});

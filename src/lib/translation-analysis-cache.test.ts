import { describe, expect, it } from 'bun:test';

import { createTranslationAnalysisCache } from './translation-analysis-cache';

describe('createTranslationAnalysisCache', () => {
    it('should reuse cached analyses while the file fingerprint is unchanged', async () => {
        const files = new Map([['/root/a.json', { content: 'first', mtimeMs: 1, sizeBytes: 5 }]]);
        let readCount = 0;
        let buildCount = 0;

        const cache = createTranslationAnalysisCache({
            buildAnalysis: async (relativePath, content) => {
                buildCount += 1;
                return {
                    invalidRows: [],
                    isValid: true,
                    model: 'gpt-5-4',
                    patchesApplied: 0,
                    path: relativePath,
                    playableExcerpts: [],
                    reasoningDurationSec: content.length,
                };
            },
            getFileFingerprint: async (fullPath) => {
                const file = files.get(fullPath);
                if (!file) {
                    throw new Error(`Missing file: ${fullPath}`);
                }

                return { mtimeMs: file.mtimeMs, sizeBytes: file.sizeBytes };
            },
            loadContent: async (fullPath) => {
                readCount += 1;
                const file = files.get(fullPath);
                if (!file) {
                    throw new Error(`Missing file: ${fullPath}`);
                }

                return file.content;
            },
        });

        const first = await cache.getFileAnalysis('/root', 'a.json');
        const second = await cache.getFileAnalysis('/root', 'a.json');

        expect(first).toBe(second);
        expect(readCount).toBe(1);
        expect(buildCount).toBe(1);
    });

    it('should invalidate cached analyses when the fingerprint changes', async () => {
        const files = new Map([['/root/a.json', { content: 'first', mtimeMs: 1, sizeBytes: 5 }]]);
        let readCount = 0;
        let buildCount = 0;

        const cache = createTranslationAnalysisCache({
            buildAnalysis: async (relativePath, content) => {
                buildCount += 1;
                return {
                    invalidRows: [],
                    isValid: true,
                    model: 'gpt-5-4',
                    patchesApplied: 0,
                    path: relativePath,
                    playableExcerpts: [],
                    reasoningDurationSec: content.length,
                };
            },
            getFileFingerprint: async (fullPath) => {
                const file = files.get(fullPath);
                if (!file) {
                    throw new Error(`Missing file: ${fullPath}`);
                }

                return { mtimeMs: file.mtimeMs, sizeBytes: file.sizeBytes };
            },
            loadContent: async (fullPath) => {
                readCount += 1;
                const file = files.get(fullPath);
                if (!file) {
                    throw new Error(`Missing file: ${fullPath}`);
                }

                return file.content;
            },
        });

        await cache.getFileAnalysis('/root', 'a.json');
        files.set('/root/a.json', { content: 'second-pass', mtimeMs: 2, sizeBytes: 11 });
        const next = await cache.getFileAnalysis('/root', 'a.json');

        expect(next.reasoningDurationSec).toBe(11);
        expect(readCount).toBe(2);
        expect(buildCount).toBe(2);
    });

    it('should bound concurrent analysis work', async () => {
        const files = new Map(
            ['a.json', 'b.json', 'c.json', 'd.json'].map((name) => [
                `/root/${name}`,
                { content: name, mtimeMs: 1, sizeBytes: name.length },
            ]),
        );
        let activeLoads = 0;
        let maxActiveLoads = 0;

        const cache = createTranslationAnalysisCache({
            buildAnalysis: async (relativePath) => ({
                invalidRows: [],
                isValid: true,
                model: undefined,
                patchesApplied: 0,
                path: relativePath,
                playableExcerpts: [],
                reasoningDurationSec: undefined,
            }),
            getFileFingerprint: async (fullPath) => {
                const file = files.get(fullPath);
                if (!file) {
                    throw new Error(`Missing file: ${fullPath}`);
                }

                return { mtimeMs: file.mtimeMs, sizeBytes: file.sizeBytes };
            },
            loadContent: async (fullPath) => {
                activeLoads += 1;
                maxActiveLoads = Math.max(maxActiveLoads, activeLoads);
                await new Promise((resolve) => setTimeout(resolve, 10));
                activeLoads -= 1;

                const file = files.get(fullPath);
                if (!file) {
                    throw new Error(`Missing file: ${fullPath}`);
                }

                return file.content;
            },
        });

        await cache.getFileAnalyses('/root', ['a.json', 'b.json', 'c.json', 'd.json'], 2);

        expect(maxActiveLoads).toBeLessThanOrEqual(2);
    });
});

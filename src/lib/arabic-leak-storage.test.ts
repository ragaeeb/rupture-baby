import { afterEach, describe, expect, it } from 'bun:test';

import { ARABIC_LEAK_STORAGE_KEY, storeArabicLeakCorrections } from './arabic-leak-storage';
import type { RupturePatchMetadata } from './translation-patches';

const makeMetadata = (appliedAt: string, model: string): RupturePatchMetadata => ({
    appliedAt,
    source: { kind: 'llm', model, provider: 'nvidia', task: 'arabic_leak_correction' },
});

const originalWindow = globalThis.window;

afterEach(() => {
    if (originalWindow) {
        globalThis.window = originalWindow;
        return;
    }

    delete (globalThis as { window?: Window }).window;
});

describe('arabic leak storage', () => {
    it('should store observations and unique responses for the same Arabic key', () => {
        const storage = new Map<string, string>();
        globalThis.window = {
            localStorage: {
                getItem: (key: string) => storage.get(key) ?? null,
                removeItem: (key: string) => {
                    storage.delete(key);
                },
                setItem: (key: string, value: string) => {
                    storage.set(key, value);
                },
            },
        } as unknown as Window & typeof globalThis;

        storeArabicLeakCorrections({
            corrections: [{ filePath: 'a.json', id: 'P1', match: 'راجع', replacement: 'see above' }],
            patchMetadata: makeMetadata('2026-04-07T00:00:00.000Z', 'model-a'),
        });
        storeArabicLeakCorrections({
            corrections: [{ filePath: 'c.json', id: 'P2', match: 'راجع', replacement: 'see above' }],
            patchMetadata: makeMetadata('2026-04-07T01:00:00.000Z', 'model-b'),
        });

        const rawCache = JSON.parse(storage.get(ARABIC_LEAK_STORAGE_KEY) ?? '{}') as {
            راجع?: {
                observations?: Array<{
                    metadata: { excerptId: string; filePath: string; match: string };
                    response: string;
                }>;
                responses?: string[];
            };
        };

        expect(rawCache.راجع?.responses).toEqual(['see above']);
        expect(rawCache.راجع?.observations).toHaveLength(2);
        expect(rawCache.راجع?.observations?.[0]?.metadata.filePath).toBe('a.json');
        expect(rawCache.راجع?.observations?.[1]?.metadata.excerptId).toBe('P2');
    });

    it('should keep distinct responses for the same Arabic key', () => {
        const storage = new Map<string, string>();
        globalThis.window = {
            localStorage: {
                getItem: (key: string) => storage.get(key) ?? null,
                removeItem: (key: string) => {
                    storage.delete(key);
                },
                setItem: (key: string, value: string) => {
                    storage.set(key, value);
                },
            },
        } as unknown as Window & typeof globalThis;

        storeArabicLeakCorrections({
            corrections: [{ filePath: 'a.json', id: 'P1', match: 'نص عربي', replacement: 'first response' }],
            patchMetadata: makeMetadata('2026-04-07T00:00:00.000Z', 'model-a'),
        });
        storeArabicLeakCorrections({
            corrections: [{ filePath: 'b.json', id: 'P2', match: 'نص عربي', replacement: 'different response' }],
            patchMetadata: makeMetadata('2026-04-07T01:00:00.000Z', 'model-b'),
        });

        const rawCache = JSON.parse(storage.get(ARABIC_LEAK_STORAGE_KEY) ?? '{}') as {
            'نص عربي'?: {
                observations?: Array<{
                    metadata: { excerptId: string; filePath: string; match: string };
                    response: string;
                }>;
                responses?: string[];
            };
        };

        expect(rawCache['نص عربي']?.responses).toEqual(['first response', 'different response']);
        expect(rawCache['نص عربي']?.observations).toHaveLength(2);
    });
});

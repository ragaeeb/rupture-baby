import { describe, expect, it } from 'bun:test';

import { filterTranslationTreeEntries } from './translation-tree-filter';

describe('filterTranslationTreeEntries', () => {
    const entries = [
        {
            children: [
                { kind: 'file' as const, name: 'a.json', relativePath: 'nested/a.json' },
                { kind: 'file' as const, name: 'b.json', relativePath: 'nested/b.json' },
                { kind: 'file' as const, name: 'c.json', relativePath: 'nested/c.json' },
            ],
            kind: 'directory' as const,
            name: 'nested',
            relativePath: 'nested',
        },
    ];

    const translationStats = {
        files: [
            { isValid: false, model: 'gpt-5-4-pro', patchesApplied: 0, path: 'nested/a.json', reasoningDurationSec: 8 },
            { isValid: true, model: 'gpt-5-4-pro', patchesApplied: 0, path: 'nested/b.json', reasoningDurationSec: 22 },
            { isValid: false, model: 'grok-4', patchesApplied: 0, path: 'nested/c.json', reasoningDurationSec: 75 },
        ],
        invalidByModel: { 'gpt-5-4-pro': 1, 'grok-4': 1 },
        invalidFiles: 2,
        modelBreakdown: { 'gpt-5-4-pro': 2, 'grok-4': 1 },
        patchesApplied: 0,
        thinkingTimeBreakdown: { '1m_plus': 1, '10_to_30s': 1, '30_to_60s': 0, lt_10s: 1 },
        totalFiles: 3,
        validFiles: 1,
    };

    it('should apply model and status filters as an AND at the file level', () => {
        const filtered = filterTranslationTreeEntries(entries, translationStats, {
            model: 'gpt-5-4-pro',
            status: 'invalid',
            thinkingTime: 'all',
        });

        expect(filtered).toEqual([
            {
                children: [{ kind: 'file', name: 'a.json', relativePath: 'nested/a.json' }],
                kind: 'directory',
                name: 'nested',
                relativePath: 'nested',
            },
        ]);
    });

    it('should return the unfiltered tree when no filters are active', () => {
        expect(
            filterTranslationTreeEntries(entries, translationStats, {
                model: 'all',
                status: 'all',
                thinkingTime: 'all',
            }),
        ).toEqual(entries);
    });

    it('should filter by thinking time range', () => {
        const filtered = filterTranslationTreeEntries(entries, translationStats, {
            model: 'all',
            status: 'all',
            thinkingTime: '10_to_30s',
        });

        expect(filtered).toEqual([
            {
                children: [{ kind: 'file', name: 'b.json', relativePath: 'nested/b.json' }],
                kind: 'directory',
                name: 'nested',
                relativePath: 'nested',
            },
        ]);
    });
});

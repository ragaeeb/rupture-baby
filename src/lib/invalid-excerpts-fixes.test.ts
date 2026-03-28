import { describe, expect, it } from 'bun:test';

import { commitInvalidPendingEdits, updateInvalidPendingEdits } from './invalid-excerpts-fixes';
import { createRupturePatch, type RupturePatchMetadata } from './translation-patches';

describe('updateInvalidPendingEdits', () => {
    it('should clear stale highlight metadata when a staged AI fix is manually edited', () => {
        const existingPatch = createRupturePatch('the leaked text', 'the fixed text');
        if (!existingPatch) {
            throw new Error('Expected patch to be created');
        }

        const existingMetadata: RupturePatchMetadata = {
            appliedAt: '2026-03-27T00:00:00.000Z',
            highlights: [{ range: { end: 8, start: 4 }, title: 'النص' }],
            source: {
                kind: 'llm',
                model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
                provider: 'cloudflare',
                task: 'arabic_leak_correction',
            },
        };
        const nextPatch = createRupturePatch('the leaked text', 'the carefully fixed text');
        if (!nextPatch) {
            throw new Error('Expected patch to be created');
        }

        const nextEdits = updateInvalidPendingEdits(
            {
                'file.json::P1': {
                    excerptId: 'P1',
                    filePath: 'file.json',
                    metadata: existingMetadata,
                    nextTranslation: 'the fixed text',
                    patch: existingPatch,
                },
            },
            {
                arabic: 'نص عربي',
                arabicLeakHints: ['النص'],
                baseTranslation: 'the leaked text',
                errorTypes: ['arabic_leak'],
                filePath: 'file.json',
                id: 'P1',
                messages: ['Arabic script detected'],
                patchHighlights: [],
                translation: 'the fixed text',
                validationHighlightRanges: [{ end: 8, start: 4 }],
            },
            'the carefully fixed text',
        );

        expect(nextEdits['file.json::P1']).toEqual({
            excerptId: 'P1',
            filePath: 'file.json',
            metadata: {
                appliedAt: '2026-03-27T00:00:00.000Z',
                source: {
                    kind: 'llm',
                    model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
                    provider: 'cloudflare',
                    task: 'arabic_leak_correction',
                },
            },
            nextTranslation: 'the carefully fixed text',
            patch: nextPatch,
        });
    });
});

describe('commitInvalidPendingEdits', () => {
    it('should commit all pending edits and invalidate route data afterward', async () => {
        const firstPatch = createRupturePatch('bad one', 'good one');
        const secondPatch = createRupturePatch('bad two', 'good two');
        if (!firstPatch || !secondPatch) {
            throw new Error('Expected patches to be created');
        }

        const committedExcerptIds: string[] = [];
        let invalidateCalls = 0;

        const committedRowKeys = await commitInvalidPendingEdits({
            commitPatch: async (pendingEdit) => {
                committedExcerptIds.push(pendingEdit.excerptId);
            },
            invalidate: async () => {
                invalidateCalls += 1;
            },
            pendingEdits: {
                'a.json::P1': { excerptId: 'P1', filePath: 'a.json', nextTranslation: 'good one', patch: firstPatch },
                'b.json::P2': { excerptId: 'P2', filePath: 'b.json', nextTranslation: 'good two', patch: secondPatch },
            },
        });

        expect(committedExcerptIds).toEqual(['P1', 'P2']);
        expect(invalidateCalls).toBe(1);
        expect(committedRowKeys).toEqual(['a.json::P1', 'b.json::P2']);
    });
});

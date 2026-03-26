import { describe, expect, it } from 'bun:test';
import {
    buildLineStartLabelPattern,
    buildPunctuationPattern,
    buildSpeakerLabelPattern,
    extractTranslationIds,
    formatExcerptsForPrompt,
    inferSpeakerLabels,
    normalizeTranslationText,
    parseTranslations,
    parseTranslationsInOrder,
} from './textUtils';

describe('normalizeTranslationText', () => {
    it('should normalize CRLF/CR to LF', () => {
        const input = 'P1 - a\r\nP2 - b\rP3 - c';
        const out = normalizeTranslationText(input);
        expect(out.includes('\r')).toBeFalse();
        expect(out.split('\n').length).toBeGreaterThan(1);
    });

    it('should split merged markers (no space) onto a new line', () => {
        const input = 'helloP1 - x';
        const out = normalizeTranslationText(input);
        expect(out).toBe('hello\nP1 - x');
    });

    it('should split merged markers (with space) onto a new line', () => {
        const input = 'hello P1 - x';
        const out = normalizeTranslationText(input);
        expect(out).toBe('hello\nP1 - x');
    });

    it('should unescape bracket opener', () => {
        const input = 'P1 - One\\[two]';
        const out = normalizeTranslationText(input);
        expect(out).toBe('P1 - One[two]');
    });

    it('should extract translation ids', () => {
        const ids = extractTranslationIds('P1 - a\nP2b - b\nB100j - c');
        expect(ids).toEqual(['P1', 'P2b', 'B100j']);
    });
});

describe('speaker label helpers', () => {
    it('should build a speaker label alternation pattern', () => {
        const pattern = buildSpeakerLabelPattern(['Questioner', 'The Shaykh']);
        expect(pattern).toBe('(?:Questioner\\s*:|The Shaykh\\s*:)');
    });

    it('should build a punctuation alternation pattern', () => {
        const pattern = buildPunctuationPattern(['.', '?', '—']);
        expect(pattern).toBe('\\.|\\?|—');
    });

    it('should build a line-start label regex with optional ID prefix', () => {
        const pattern = buildLineStartLabelPattern(['Questioner']);
        expect(pattern.test('P1 - Questioner: Yes.')).toBeTrue();
        expect(pattern.test('Questioner: Yes.')).toBeTrue();
        expect(pattern.test('He said Questioner: Yes.')).toBeFalse();
    });

    it('should infer repeated speaker labels ordered by first appearance', () => {
        const text = 'P1 - Questioner: Hi. The Shaykh: Hello. Questioner: Again. The Shaykh: Reply.';
        expect(inferSpeakerLabels(text)).toEqual(['Questioner', 'The Shaykh']);
    });
});

describe('extractTranslationIds', () => {
    it('should format segments with prompt prefix', () => {
        const segments = [
            { id: 'P1', text: 'Arabic 1' },
            { id: 'P2', text: 'Arabic 2' },
        ];
        const result = formatExcerptsForPrompt(segments, 'Translate:');
        expect(result).toBe('Translate:\n\nP1 - Arabic 1\n\nP2 - Arabic 2');
    });
});

describe('parseTranslations', () => {
    it('should build a map for O(1) lookup', () => {
        const { count, translationMap } = parseTranslations('P1 - a\nP2 - b');
        expect(count).toBe(2);
        expect(translationMap.get('P1')).toBe('a');
        expect(translationMap.get('P2')).toBe('b');
    });

    it('should associate multi-line content with the previous ID', () => {
        const input = ['P1 - Line 1', 'Line 2', 'P2 - Next'].join('\n');
        const { translationMap } = parseTranslations(input);
        expect(translationMap.get('P1')).toBe('Line 1\nLine 2');
        expect(translationMap.get('P2')).toBe('Next');
    });

    it('should ignore content before the first marker', () => {
        const input = ['preface', 'P1 - a'].join('\n');
        const { count, translationMap } = parseTranslations(input);
        expect(count).toBe(1);
        expect(translationMap.get('P1')).toBe('a');
    });

    it('parses multiple translation entries into a Map', () => {
        const input = `P11622a - First translation
C11623 - Second translation`;

        const result = parseTranslations(input);

        expect(result.count).toBe(2);
        expect(result.translationMap.get('P11622a')).toBe('First translation');
        expect(result.translationMap.get('C11623')).toBe('Second translation');
    });

    it('handles multi-line translations', () => {
        const input = `P11622a - First line of translation
Second line continues here
Third line as well

C11623 - New translation`;

        const result = parseTranslations(input);

        expect(result.count).toBe(2);
        expect(result.translationMap.get('P11622a')).toBe(
            'First line of translation\nSecond line continues here\nThird line as well',
        );
        expect(result.translationMap.get('C11623')).toBe('New translation');
    });

    it('skips empty lines', () => {
        const input = `P123 - Translation


C456 - Another`;

        const result = parseTranslations(input);

        expect(result.count).toBe(2);
    });

    it('returns empty Map for empty input', () => {
        const result = parseTranslations('');
        expect(result.count).toBe(0);
        expect(result.translationMap.size).toBe(0);
    });

    it('ignores lines without valid markers that come before first translation', () => {
        const input = `Some random text
P123 - Actual translation`;

        const result = parseTranslations(input);

        expect(result.count).toBe(1);
        expect(result.translationMap.get('P123')).toBe('Actual translation');
    });

    it('handles large number of translations efficiently', () => {
        // Generate 1000 translations
        const lines: string[] = [];
        for (let i = 0; i < 1000; i++) {
            lines.push(`P${i} - Translation number ${i}`);
        }
        const input = lines.join('\n');

        const start = performance.now();
        const result = parseTranslations(input);
        const elapsed = performance.now() - start;

        expect(result.count).toBe(1000);
        expect(elapsed).toBeLessThan(100); // Should complete in under 100ms
    });

    it('overwrites duplicate IDs with last occurrence', () => {
        const input = `P123 - First version
P123 - Second version`;

        const result = parseTranslations(input);

        expect(result.count).toBe(1);
        expect(result.translationMap.get('P123')).toBe('Second version');
    });
});

describe('parseTranslationsInOrder', () => {
    it('should preserve translated order', () => {
        const entries = parseTranslationsInOrder('P1 - a\nP2 - b\nP3 - c');
        expect(entries.map((e) => e.id)).toEqual(['P1', 'P2', 'P3']);
    });

    it('should preserve duplicates as separate entries', () => {
        const input = ['P1 - first', 'P2 - mid', 'P1 - second'].join('\n');
        const entries = parseTranslationsInOrder(input);
        expect(entries).toEqual([
            { id: 'P1', translation: 'first' },
            { id: 'P2', translation: 'mid' },
            { id: 'P1', translation: 'second' },
        ]);
    });
});

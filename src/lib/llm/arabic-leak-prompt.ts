import type { ArabicLeakCorrection, TranslationAssistRequest } from '@/lib/shell-types';

type ModelArabicLeakCorrection = Omit<ArabicLeakCorrection, 'filePath'>;

export const buildArabicLeakCorrectionPrompt = (excerpts: TranslationAssistRequest['excerpts']) => {
    const promptExcerpts = excerpts.map(({ arabic, id, leakHints, translation }) => ({
        arabic,
        id,
        leakHints: leakHints && leakHints.length > 0 ? leakHints : undefined,
        translation,
    }));

    return [
        'You are an expert Arabic to English translator specializing in Islamic content.',
        '',
        'I will provide you with a JSON object containing translated passages that contain one or more untranslated Arabic-script words or phrases that were left in by the original translator. Your task is to identify only those Arabic-script leaks in each passage and provide the correct English replacement.',
        '',
        'INPUT FORMAT:',
        '{"excerpts": [{"id": "...", "arabic": "...", "translation": "...", "leakHints": ["..."]}, ...]}',
        '',
        'RULES:',
        '1. Identify only Arabic-script words or phrases that remain untranslated in the English translation.',
        '2. Consecutive Arabic words or characters that form a single phrase should be treated as ONE match, including any punctuation attached to them.',
        '3. Do not return corrections for transliterations, glosses, explanatory parentheticals, Islamic terminology already translated into English, or stylistic choices that do not contain Arabic script.',
        '4. If "leakHints" are provided, treat them as the exact Arabic-script leak targets. Prefer those hints over searching for other issues.',
        '5. If the same Arabic word or phrase appears more than once in the same passage and carries a different meaning each time, expand the "match" field with enough surrounding translated words to make it uniquely identifiable. Only do this when meanings differ.',
        '6. Use the provided original Arabic source text to determine the correct translation in context.',
        '7. Preserve the surrounding translated English wording as much as possible. Only change what is necessary to replace the leaked Arabic correctly.',
        '8. Every "match" value must itself contain Arabic script. Never return a pure English or transliterated match.',
        '9. Echo the exact "id" for every correction object.',
        '10. Your response must be only a raw JSON object. No markdown fences, no preamble, no commentary, nothing else.',
        '',
        'OUTPUT FORMAT:',
        '{"corrections": [{"id": "...", "match": "...", "replacement": "..."}]}',
        '',
        '- "match" is the exact string to find and replace in the translation.',
        '- "replacement" is the full replacement string, preserving any surrounding translated words added for uniqueness.',
        '- If a passage has no Arabic leaks, omit it from the corrections array.',
        '- Multiple corrections for the same passage are represented as separate objects with the same "id".',
        '',
        'INPUT:',
        JSON.stringify({ excerpts: promptExcerpts }),
    ].join('\n');
};

const isArabicLeakCorrection = (value: unknown): value is ModelArabicLeakCorrection =>
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'match' in value &&
    'replacement' in value &&
    typeof value.id === 'string' &&
    typeof value.match === 'string' &&
    typeof value.replacement === 'string';

export const parseArabicLeakCorrectionResponse = (responseText: string): ModelArabicLeakCorrection[] => {
    const parsed = JSON.parse(responseText) as { corrections?: unknown };
    if (!Array.isArray(parsed.corrections) || !parsed.corrections.every(isArabicLeakCorrection)) {
        throw new Error('The provider returned an invalid Arabic leak correction payload.');
    }

    return parsed.corrections.filter(
        (correction) =>
            correction.id.trim().length > 0 && correction.match.length > 0 && correction.replacement.length > 0,
    );
};

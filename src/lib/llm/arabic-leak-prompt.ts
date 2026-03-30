import type { TranslationAssistRequest, TranslationTextCorrection } from '@/lib/shell-types';

type ModelTextCorrection = Omit<TranslationTextCorrection, 'filePath'>;
type ModelTextCorrectionEntry = { match: string; replacement: string };
type ModelTextCorrectionMap = Record<string, ModelTextCorrectionEntry[]>;

export const buildArabicLeakCorrectionPrompt = (excerpts: TranslationAssistRequest['excerpts']) => {
    const promptExcerpts = excerpts.map(({ arabic, id, matchHints, translation }) => ({
        arabic,
        id,
        matchHints: matchHints && matchHints.length > 0 ? matchHints : undefined,
        translation,
    }));

    return [
        'You are an expert Arabic to English translator specializing in Islamic content.',
        '',
        'I will provide you with a JSON object containing translated passages that contain one or more untranslated Arabic-script words or phrases that were left in by the original translator. Your task is to identify only those Arabic-script leaks in each passage and provide the correct English replacement.',
        '',
        'INPUT FORMAT:',
        '{"excerpts": [{"id": "...", "arabic": "...", "translation": "...", "matchHints": ["..."]}, ...]}',
        '',
        'RULES:',
        '1. Identify only Arabic-script words or phrases that remain untranslated in the English translation.',
        '2. Consecutive Arabic words or characters that form a single phrase should be treated as ONE match, including any punctuation attached to them.',
        '3. Do not return corrections for transliterations, glosses, explanatory parentheticals, Islamic terminology already translated into English, or stylistic choices that do not contain Arabic script.',
        '4. If "matchHints" are provided, treat them as the exact Arabic-script leak targets. Prefer those hints over searching for other issues.',
        '5. If the same Arabic word or phrase appears more than once in the same passage and all occurrences should receive the same replacement, return that correction only ONCE for that passage.',
        '6. If the same Arabic word or phrase appears more than once in the same passage and carries a different meaning each time, expand the "match" field with enough surrounding translated words to make it uniquely identifiable. Only do this when meanings differ.',
        '7. Use the provided original Arabic source text to determine the correct translation in context.',
        '8. The replacement must fit grammatically and idiomatically into the exact English sentence slot where the Arabic leak appears.',
        '9. Match the surrounding English grammar. Preserve the correct part of speech, tense, number, definiteness, and syntactic role required by the nearby English words.',
        '10. Return a base verb when the sentence calls for a bare verb, infinitive, or imperative. Return a gerund or participle only when the surrounding English explicitly requires that form.',
        '11. Preserve the surrounding translated English wording as much as possible. Only change what is necessary to replace the leaked Arabic correctly.',
        '12. Every "match" value must itself contain Arabic script. Never return a pure English or transliterated match.',
        '13. Do not emit duplicate correction objects with the same "match" and "replacement" for the same excerpt id.',
        '14. You must return every input "id" exactly once in the output "results" object, even if that excerpt has no corrections.',
        '15. Each "results" entry must be an array. Use an empty array when an excerpt has no Arabic leaks.',
        '16. Echo the exact "id" for every correction object.',
        '17. Your response must be only a raw JSON object. No markdown fences, no preamble, no commentary, nothing else.',
        '',
        'OUTPUT FORMAT:',
        '{"results": {"P1": [{"match": "...", "replacement": "..."}], "P2": []}}',
        '',
        '- The top-level "results" object must contain every input excerpt id as a key.',
        '- Each value in "results" must be an array of correction objects for that id.',
        '- "match" is the exact string to find and replace in the translation.',
        '- "replacement" is the full replacement string, preserving any surrounding translated words added for uniqueness.',
        '- The replacement must read as natural English inside the original sentence, not as a dictionary gloss or isolated lemma.',
        '',
        'GRAMMAR EXAMPLES:',
        '- If the translation says "We should [ARABIC] the book", the replacement should be "review", not "reviewing".',
        '- If the translation says "He is [ARABIC] the book", the replacement should be "reviewing", not "review".',
        '- If you expand "match" with surrounding English words for uniqueness, "replacement" must preserve those surrounding English words and still read naturally.',
        '',
        'INPUT:',
        JSON.stringify({ excerpts: promptExcerpts }),
    ].join('\n');
};

const isTextCorrection = (value: unknown): value is ModelTextCorrection =>
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'match' in value &&
    'replacement' in value &&
    typeof value.id === 'string' &&
    typeof value.match === 'string' &&
    typeof value.replacement === 'string';

const isTextCorrectionEntry = (value: unknown): value is ModelTextCorrectionEntry =>
    typeof value === 'object' &&
    value !== null &&
    'match' in value &&
    'replacement' in value &&
    typeof value.match === 'string' &&
    typeof value.replacement === 'string';

export const buildTextCorrectionJsonSchema = (excerpts: TranslationAssistRequest['excerpts']) => ({
    additionalProperties: false,
    properties: {
        results: {
            additionalProperties: false,
            properties: Object.fromEntries(
                excerpts.map((excerpt) => [
                    excerpt.id,
                    {
                        items: {
                            additionalProperties: false,
                            properties: { match: { type: 'string' }, replacement: { type: 'string' } },
                            required: ['match', 'replacement'],
                            type: 'object',
                        },
                        type: 'array',
                    },
                ]),
            ),
            required: excerpts.map((excerpt) => excerpt.id),
            type: 'object',
        },
    },
    required: ['results'],
    type: 'object',
});

const dedupeTextCorrections = (corrections: ModelTextCorrection[]) => {
    const seen = new Set<string>();

    return corrections.filter((correction) => {
        const key = `${correction.id}\u0000${correction.match}\u0000${correction.replacement}`;
        if (seen.has(key)) {
            return false;
        }

        seen.add(key);
        return true;
    });
};

const extractRecoverableJsonObject = (text: string) => {
    const startIndex = text.indexOf('{');
    if (startIndex === -1) {
        return null;
    }

    for (let endIndex = text.length; endIndex > startIndex; endIndex -= 1) {
        const candidate = text.slice(startIndex, endIndex);
        try {
            JSON.parse(candidate);
            return candidate;
        } catch {}
    }

    return null;
};

const parseTextCorrectionJson = (responseText: string) => {
    try {
        return JSON.parse(responseText) as { corrections?: unknown; results?: unknown };
    } catch (error) {
        const recoveredJson = extractRecoverableJsonObject(responseText);
        if (!recoveredJson || recoveredJson === responseText) {
            throw error;
        }

        return JSON.parse(recoveredJson) as { corrections?: unknown; results?: unknown };
    }
};

export const parseTextCorrectionResponse = (responseText: string): ModelTextCorrection[] => {
    const parsed = parseTextCorrectionJson(responseText);

    if (Array.isArray(parsed.corrections) && parsed.corrections.every(isTextCorrection)) {
        return dedupeTextCorrections(
            parsed.corrections.filter(
                (correction) =>
                    correction.id.trim().length > 0 && correction.match.length > 0 && correction.replacement.length > 0,
            ),
        );
    }

    if (
        typeof parsed.results === 'object' &&
        parsed.results !== null &&
        !Array.isArray(parsed.results) &&
        Object.values(parsed.results).every(
            (corrections) => Array.isArray(corrections) && corrections.every(isTextCorrectionEntry),
        )
    ) {
        return dedupeTextCorrections(
            Object.entries(parsed.results as ModelTextCorrectionMap).flatMap(([id, corrections]) =>
                corrections
                    .filter((correction) => correction.match.length > 0 && correction.replacement.length > 0)
                    .map((correction) => ({ ...correction, id })),
            ),
        );
    }

    throw new Error('The provider returned an invalid Arabic leak correction payload.');
};

export const buildArabicLeakCorrectionJsonSchema = buildTextCorrectionJsonSchema;
export const parseArabicLeakCorrectionResponse = parseTextCorrectionResponse;

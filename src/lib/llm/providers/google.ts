import 'server-only';

import { GoogleGenAI } from '@google/genai';

import type { TranslationAssistProvider } from '@/lib/llm/types';
import type { ArabicLeakCorrection, TranslationAssistRequest } from '@/lib/shell-types';

const MODEL = 'gemini-3.1-flash-lite-preview';

let googleClient: GoogleGenAI | null = null;

const requireGoogleApiKey = () => {
    const apiKey = process.env.GOOGLE_API_KEY?.trim();
    if (!apiKey) {
        throw new Error('GOOGLE_API_KEY is not set on the server.');
    }
    return apiKey;
};

const getGoogleClient = () => {
    if (googleClient) {
        return googleClient;
    }

    googleClient = new GoogleGenAI({ apiKey: requireGoogleApiKey() });
    return googleClient;
};

const buildArabicLeakCorrectionPrompt = (request: TranslationAssistRequest) => {
    return [
        'You are an expert Arabic to English translator specializing in Islamic content.',
        '',
        'I will provide you with a JSON object containing translated passages that contain one or more untranslated Arabic words or phrases that were left in by the original translator. Your task is to identify every Arabic leak in each passage and provide the correct English replacement.',
        '',
        'INPUT FORMAT:',
        '{"excerpts": [{"id": "...", "arabic": "...", "translation": "..."}, ...]}',
        '',
        'RULES:',
        '1. Identify ALL Arabic words or phrases remaining in each translation.',
        '2. Consecutive Arabic words or characters that form a single phrase should be treated as ONE match, including any punctuation attached to them.',
        '3. If the same Arabic word or phrase appears more than once in the same passage and carries a different meaning each time, expand the "match" field with enough surrounding translated words to make it uniquely identifiable. Only do this when meanings differ.',
        '4. Use the provided original Arabic source text to determine the correct translation in context.',
        '5. Preserve the surrounding translated English wording as much as possible. Only change what is necessary to replace the leaked Arabic correctly.',
        '6. Your response must be only a raw JSON object. No markdown fences, no preamble, no commentary, nothing else.',
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
        JSON.stringify({ excerpts: request.excerpts }),
    ].join('\n');
};

const isArabicLeakCorrection = (value: unknown): value is ArabicLeakCorrection =>
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'match' in value &&
    'replacement' in value &&
    typeof value.id === 'string' &&
    typeof value.match === 'string' &&
    typeof value.replacement === 'string';

const parseCorrectionResponse = (responseText: string): ArabicLeakCorrection[] => {
    const parsed = JSON.parse(responseText) as { corrections?: unknown };
    if (!Array.isArray(parsed.corrections) || !parsed.corrections.every(isArabicLeakCorrection)) {
        throw new Error('Google GenAI returned an invalid Arabic leak correction payload.');
    }

    return parsed.corrections.filter(
        (correction) =>
            correction.id.trim().length > 0 && correction.match.length > 0 && correction.replacement.length > 0,
    );
};

const serializeGoogleError = (error: unknown) => {
    if (!(error instanceof Error)) {
        return { raw: error };
    }

    const candidate = error as Error & {
        cause?: unknown;
        code?: unknown;
        details?: unknown;
        response?: unknown;
        status?: unknown;
    };

    return {
        cause: candidate.cause,
        code: candidate.code,
        details: candidate.details,
        message: candidate.message,
        name: candidate.name,
        response: candidate.response,
        stack: candidate.stack,
        status: candidate.status,
    };
};

export const getGoogleAssistModel = () => MODEL;

export const googleTranslationAssistProvider: TranslationAssistProvider = {
    model: MODEL,
    requestAssistance: async (request) => {
        const startedAt = performance.now();
        const excerptCount = request.excerpts.length;

        console.info('[google-genai] assist request', {
            excerptCount,
            model: MODEL,
            scope: request.scope,
            task: request.task,
        });

        let response: Awaited<ReturnType<GoogleGenAI['models']['generateContent']>>;
        try {
            response = await getGoogleClient().models.generateContent({
                config: {
                    responseMimeType: 'application/json',
                    systemInstruction:
                        'You are a precise Arabic-to-English Islamic translation QA assistant. Return valid JSON only.',
                    temperature: 0,
                },
                contents: buildArabicLeakCorrectionPrompt(request),
                model: MODEL,
            });
        } catch (error) {
            console.error('[google-genai] assist request failed', {
                durationMs: Math.round(performance.now() - startedAt),
                error: serializeGoogleError(error),
                excerptCount,
                model: MODEL,
                scope: request.scope,
                task: request.task,
            });
            throw error;
        }

        const responseText = response.text?.trim();
        if (!responseText) {
            throw new Error('Google GenAI returned an empty response.');
        }

        console.log('request sent', request.excerpts);
        console.log('responseText', responseText);

        let corrections: ArabicLeakCorrection[];
        try {
            corrections = parseCorrectionResponse(responseText);
        } catch (error) {
            console.error('[google-genai] assist response parse failed', {
                durationMs: Math.round(performance.now() - startedAt),
                excerptCount,
                model: MODEL,
                responseId: response.responseId,
                responseText,
            });
            throw error;
        }

        console.info('[google-genai] assist response', {
            correctionCount: corrections.length,
            durationMs: Math.round(performance.now() - startedAt),
            excerptCount,
            model: MODEL,
            modelVersion: response.modelVersion,
            responseId: response.responseId,
        });

        return {
            corrections,
            model: MODEL,
            modelVersion: response.modelVersion,
            patchMetadata: {
                appliedAt: new Date().toISOString(),
                source: {
                    kind: 'llm',
                    model: MODEL,
                    modelVersion: response.modelVersion,
                    provider: 'google',
                    task: 'arabic_leak_correction',
                },
            },
            provider: 'google',
            scope: request.scope,
            task: request.task,
        };
    },
};

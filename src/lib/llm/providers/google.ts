import '@tanstack/react-start/server-only';

import { GoogleGenAI } from '@google/genai';
import { estimateTokenCount, LLMProvider } from 'bitaboom';

import type { TranslationAssistProvider } from '@/lib/llm/types';
import type { ArabicLeakCorrection, TranslationAssistRequest } from '@/lib/shell-types';

const MODEL = 'gemini-3.1-flash-lite-preview';
const DEFAULT_MAX_EXCERPTS_PER_REQUEST = 10;
const INTER_CHUNK_DELAY_MS = { max: 900, min: 300 } as const;

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

const getMaxExcerptsPerRequest = () => {
    const configuredValue = Number.parseInt(process.env.GEMINI_ASSIST_MAX_EXCERPTS_PER_REQUEST ?? '', 10);

    if (!Number.isFinite(configuredValue) || configuredValue < 1) {
        return DEFAULT_MAX_EXCERPTS_PER_REQUEST;
    }

    return configuredValue;
};

const buildArabicLeakCorrectionPromptPrefix = () => {
    return [
        'You are an expert Arabic to English translator specializing in Islamic content.',
        '',
        'I will provide you with a JSON object containing translated passages that contain one or more untranslated Arabic words or phrases that were left in by the original translator. Your task is to identify every Arabic leak in each passage and provide the correct English replacement.',
        '',
        'INPUT FORMAT:',
        '{"excerpts": [{"filePath": "...", "id": "...", "arabic": "...", "translation": "..."}, ...]}',
        '',
        'RULES:',
        '1. Identify ALL Arabic words or phrases remaining in each translation.',
        '2. Consecutive Arabic words or characters that form a single phrase should be treated as ONE match, including any punctuation attached to them.',
        '3. If the same Arabic word or phrase appears more than once in the same passage and carries a different meaning each time, expand the "match" field with enough surrounding translated words to make it uniquely identifiable. Only do this when meanings differ.',
        '4. Use the provided original Arabic source text to determine the correct translation in context.',
        '5. Preserve the surrounding translated English wording as much as possible. Only change what is necessary to replace the leaked Arabic correctly.',
        '6. Echo the exact "filePath" and "id" for every correction object.',
        '7. Your response must be only a raw JSON object. No markdown fences, no preamble, no commentary, nothing else.',
        '',
        'OUTPUT FORMAT:',
        '{"corrections": [{"filePath": "...", "id": "...", "match": "...", "replacement": "..."}]}',
        '',
        '- "filePath" must exactly match the input excerpt object.',
        '- "match" is the exact string to find and replace in the translation.',
        '- "replacement" is the full replacement string, preserving any surrounding translated words added for uniqueness.',
        '- If a passage has no Arabic leaks, omit it from the corrections array.',
        '- Multiple corrections for the same passage are represented as separate objects with the same "id".',
    ].join('\n');
};

const isArabicLeakCorrection = (value: unknown): value is ArabicLeakCorrection =>
    typeof value === 'object' &&
    value !== null &&
    'filePath' in value &&
    'id' in value &&
    'match' in value &&
    'replacement' in value &&
    typeof value.filePath === 'string' &&
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

const estimateTokenCounts = (parts: string[]) =>
    parts.reduce((total, part) => total + estimateTokenCount(part, LLMProvider.Gemini), 0);

const buildArabicLeakCorrectionPrompt = (excerpts: TranslationAssistRequest['excerpts']) => {
    const promptPrefix = buildArabicLeakCorrectionPromptPrefix();
    return [promptPrefix, '', 'INPUT:', JSON.stringify({ excerpts })].join('\n');
};

const estimateArabicLeakPromptTokens = (excerpts: TranslationAssistRequest['excerpts']) => {
    return estimateTokenCounts([buildArabicLeakCorrectionPrompt(excerpts)]);
};

const chunkAssistRequest = (request: TranslationAssistRequest) => {
    const chunks: TranslationAssistRequest['excerpts'][] = [];
    const maxExcerptsPerRequest = getMaxExcerptsPerRequest();

    for (let index = 0; index < request.excerpts.length; index += maxExcerptsPerRequest) {
        const chunk = request.excerpts.slice(index, index + maxExcerptsPerRequest);
        if (chunk.length > 0) {
            chunks.push(chunk);
        }
    }

    return chunks;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getInterChunkDelayMs = () =>
    INTER_CHUNK_DELAY_MS.min + Math.floor(Math.random() * (INTER_CHUNK_DELAY_MS.max - INTER_CHUNK_DELAY_MS.min + 1));

export const getGoogleAssistModel = () => MODEL;

export const googleTranslationAssistProvider: TranslationAssistProvider = {
    model: MODEL,
    requestAssistance: async (request) => {
        const startedAt = performance.now();
        const excerptCount = request.excerpts.length;
        const chunks = chunkAssistRequest(request);
        const estimatedInputTokens = estimateArabicLeakPromptTokens(request.excerpts);

        console.info('[google-genai] assist request', {
            chunkCount: chunks.length,
            estimatedInputTokens,
            excerptCount,
            maxExcerptsPerRequest: getMaxExcerptsPerRequest(),
            model: MODEL,
            scope: request.scope,
            task: request.task,
        });

        const corrections: ArabicLeakCorrection[] = [];
        let modelVersion: string | undefined;

        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
            const chunk = chunks[chunkIndex];
            const chunkStartedAt = performance.now();
            const chunkEstimatedTokens = estimateArabicLeakPromptTokens(chunk);

            console.info('[google-genai] assist chunk request', {
                chunkEstimatedTokens,
                chunkExcerptCount: chunk.length,
                chunkIndex: chunkIndex + 1,
                chunkTotal: chunks.length,
                model: MODEL,
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
                    contents: buildArabicLeakCorrectionPrompt(chunk),
                    model: MODEL,
                });
            } catch (error) {
                console.error('[google-genai] assist request failed', {
                    chunkEstimatedTokens,
                    chunkExcerptCount: chunk.length,
                    chunkIndex: chunkIndex + 1,
                    chunkTotal: chunks.length,
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

            let chunkCorrections: ArabicLeakCorrection[];
            try {
                chunkCorrections = parseCorrectionResponse(responseText);
            } catch (error) {
                console.error('[google-genai] assist response parse failed', {
                    chunkEstimatedTokens,
                    chunkExcerptCount: chunk.length,
                    chunkIndex: chunkIndex + 1,
                    chunkTotal: chunks.length,
                    durationMs: Math.round(performance.now() - startedAt),
                    model: MODEL,
                    responseId: response.responseId,
                    responseText,
                });
                throw error;
            }

            corrections.push(...chunkCorrections);
            modelVersion = response.modelVersion ?? modelVersion;

            console.info('[google-genai] assist chunk response', {
                chunkCorrectionCount: chunkCorrections.length,
                chunkDurationMs: Math.round(performance.now() - chunkStartedAt),
                chunkIndex: chunkIndex + 1,
                chunkTotal: chunks.length,
                model: MODEL,
                modelVersion: response.modelVersion,
                responseId: response.responseId,
            });

            if (chunkIndex < chunks.length - 1) {
                const delayMs = getInterChunkDelayMs();
                console.info('[google-genai] assist inter-chunk delay', {
                    chunkIndex: chunkIndex + 1,
                    delayMs,
                    remainingChunks: chunks.length - chunkIndex - 1,
                });
                await sleep(delayMs);
            }
        }

        console.info('[google-genai] assist response', {
            chunkCount: chunks.length,
            correctionCount: corrections.length,
            durationMs: Math.round(performance.now() - startedAt),
            estimatedInputTokens,
            excerptCount,
            model: MODEL,
            modelVersion,
        });

        return {
            corrections,
            model: MODEL,
            modelVersion,
            patchMetadata: {
                appliedAt: new Date().toISOString(),
                source: { kind: 'llm', model: MODEL, modelVersion, provider: 'google', task: 'arabic_leak_correction' },
            },
            provider: 'google',
            scope: request.scope,
            task: request.task,
        };
    },
};

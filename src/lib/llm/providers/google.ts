import '@tanstack/react-start/server-only';

import { GoogleGenAI } from '@google/genai';
import { estimateTokenCount, LLMProvider } from 'bitaboom';

import { buildArabicLeakCorrectionPrompt, parseArabicLeakCorrectionResponse } from '@/lib/llm/arabic-leak-prompt';
import type { TranslationAssistProvider } from '@/lib/llm/types';
import type { ArabicLeakCorrection, TranslationAssistRequest } from '@/lib/shell-types';

const MODEL = 'gemini-3.1-flash-lite-preview';
const DEFAULT_MAX_EXCERPTS_PER_REQUEST = 10;
const INTER_CHUNK_DELAY_MS = { max: 900, min: 300 } as const;
export const GEMINI_PROVIDER_ID = 'gemini';

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
export const isGoogleAssistConfigured = () => Boolean(process.env.GOOGLE_API_KEY?.trim());

export const googleTranslationAssistProvider: TranslationAssistProvider = {
    id: GEMINI_PROVIDER_ID,
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
            const excerptById = new Map(chunk.map((excerpt) => [excerpt.id, excerpt] as const));

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
                chunkCorrections = parseArabicLeakCorrectionResponse(responseText).map((correction) => {
                    const excerpt = excerptById.get(correction.id);
                    if (!excerpt) {
                        throw new Error(
                            `Google GenAI returned a correction for unknown excerpt id "${correction.id}".`,
                        );
                    }
                    return { ...correction, filePath: excerpt.filePath };
                });
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

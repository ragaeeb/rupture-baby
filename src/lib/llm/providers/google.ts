import '@tanstack/react-start/server-only';

import { GoogleGenAI } from '@google/genai';
import { estimateTokenCount, LLMProvider } from 'bitaboom';
import { ApiKeyManager, LoadBalancingStrategy, redactText } from 'kukamba';

import {
    buildArabicLeakCorrectionPrompt,
    parseTextCorrectionResponse,
} from '@/lib/llm/arabic-leak-prompt';
import { buildAllCapsCorrectionPrompt } from '@/lib/llm/all-caps-prompt';
import type { TranslationAssistProvider } from '@/lib/llm/types';
import type { TranslationAssistRequest, TranslationTextCorrection } from '@/lib/shell-types';

const MODEL = 'gemini-3.1-flash-lite-preview';
const DEFAULT_MAX_EXCERPTS_PER_REQUEST = 5;
const INTER_CHUNK_DELAY_MS = { max: 900, min: 300 } as const;
export const GEMINI_PROVIDER_ID = 'gemini';

const GOOGLE_KEY_SPLIT_PATTERN = /[\s,]+/;

const googleClients = new Map<string, GoogleGenAI>();
let googleKeyManager: ApiKeyManager | null = null;

const getGoogleApiKeys = () => {
    return (process.env.GOOGLE_API_KEY ?? '')
        .split(GOOGLE_KEY_SPLIT_PATTERN)
        .map((key) => key.trim())
        .filter(Boolean);
};

const requireGoogleApiKeys = () => {
    const apiKeys = getGoogleApiKeys();
    if (apiKeys.length === 0) {
        throw new Error('GOOGLE_API_KEY is not set on the server.');
    }
    return apiKeys;
};

const getGoogleKeyManager = () => {
    if (googleKeyManager) {
        return googleKeyManager;
    }

    googleKeyManager = new ApiKeyManager(requireGoogleApiKeys(), LoadBalancingStrategy.WeightedHealth);
    return googleKeyManager;
};

const getGoogleClient = (apiKey: string) => {
    const existingClient = googleClients.get(apiKey);
    if (existingClient) {
        return existingClient;
    }

    const client = new GoogleGenAI({ apiKey });
    googleClients.set(apiKey, client);
    return client;
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

const buildPromptForTask = (request: TranslationAssistRequest, excerpts: TranslationAssistRequest['excerpts']) =>
    request.task === 'all_caps_correction'
        ? buildAllCapsCorrectionPrompt(excerpts)
        : buildArabicLeakCorrectionPrompt(excerpts);

const estimatePromptTokens = (request: TranslationAssistRequest, excerpts: TranslationAssistRequest['excerpts']) =>
    estimateTokenCounts([buildPromptForTask(request, excerpts)]);

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
export const isGoogleAssistConfigured = () => getGoogleApiKeys().length > 0;

const isGoogleRateLimitError = (error: unknown) => {
    if (!(error instanceof Error)) {
        return false;
    }

    const candidate = error as Error & { status?: unknown };
    if (candidate.status === 429) {
        return true;
    }

    const message = candidate.message.toLowerCase();
    return message.includes('429') || message.includes('quota') || message.includes('rate limit');
};

const generateContentWithRotatingGoogleKey = async (
    request: Parameters<GoogleGenAI['models']['generateContent']>[0],
    context: {
        chunkEstimatedTokens: number;
        chunkExcerptCount: number;
        chunkIndex: number;
        chunkTotal: number;
        excerptCount: number;
        requestScope: TranslationAssistRequest['scope'];
        requestTask: TranslationAssistRequest['task'];
        startedAt: number;
    },
) => {
    const keyManager = getGoogleKeyManager();
    const maxAttempts = Math.max(1, keyManager.getCount());
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        let apiKey: string;
        try {
            apiKey = keyManager.getNext();
        } catch (error) {
            console.error('[google-genai] no healthy api keys available', {
                attemptsTried: attempt - 1,
                chunkEstimatedTokens: context.chunkEstimatedTokens,
                chunkExcerptCount: context.chunkExcerptCount,
                chunkIndex: context.chunkIndex,
                chunkTotal: context.chunkTotal,
                durationMs: Math.round(performance.now() - context.startedAt),
                error: serializeGoogleError(error),
                excerptCount: context.excerptCount,
                keyCount: keyManager.getCount(),
                model: MODEL,
                scope: context.requestScope,
                task: context.requestTask,
            });
            throw error;
        }

        keyManager.markRequestStart(apiKey);
        try {
            const response = await getGoogleClient(apiKey).models.generateContent(request);
            keyManager.recordSuccess(apiKey);

            console.info('[google-genai] assist key success', {
                apiKey: redactText(apiKey),
                attempt,
                chunkIndex: context.chunkIndex,
                chunkTotal: context.chunkTotal,
                model: MODEL,
            });

            return response;
        } catch (error) {
            keyManager.recordFailure(apiKey, isGoogleRateLimitError(error));
            lastError = error;

            console.warn('[google-genai] assist key failed', {
                apiKey: redactText(apiKey),
                attempt,
                chunkIndex: context.chunkIndex,
                chunkTotal: context.chunkTotal,
                error: serializeGoogleError(error),
                model: MODEL,
            });
        }
    }

    throw lastError ?? new Error('Google GenAI request failed without an error.');
};

export const googleTranslationAssistProvider: TranslationAssistProvider = {
    id: GEMINI_PROVIDER_ID,
    model: MODEL,
    requestAssistance: async (request) => {
        const startedAt = performance.now();
        const excerptCount = request.excerpts.length;
        const chunks = chunkAssistRequest(request);
        const estimatedInputTokens = estimatePromptTokens(request, request.excerpts);

        console.info('[google-genai] assist request', {
            chunkCount: chunks.length,
            estimatedInputTokens,
            excerptCount,
            maxExcerptsPerRequest: getMaxExcerptsPerRequest(),
            model: MODEL,
            scope: request.scope,
            task: request.task,
        });

        const corrections: TranslationTextCorrection[] = [];
        let modelVersion: string | undefined;

        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
            const chunk = chunks[chunkIndex];
            const chunkStartedAt = performance.now();
            const chunkEstimatedTokens = estimatePromptTokens(request, chunk);
            const excerptById = new Map(chunk.map((excerpt) => [excerpt.id, excerpt] as const));
            const prompt = buildPromptForTask(request, chunk);

            console.info('[google-genai] assist chunk request', {
                chunkEstimatedTokens,
                chunkExcerptCount: chunk.length,
                chunkIndex: chunkIndex + 1,
                chunkTotal: chunks.length,
                model: MODEL,
            });

            let response: Awaited<ReturnType<GoogleGenAI['models']['generateContent']>>;
            try {
                response = await generateContentWithRotatingGoogleKey(
                    {
                        config: {
                            responseMimeType: 'application/json',
                            systemInstruction:
                                'You are a precise Arabic-to-English Islamic translation QA assistant. Return valid JSON only.',
                            temperature: 0,
                        },
                        contents: prompt,
                        model: MODEL,
                    },
                    {
                        chunkEstimatedTokens,
                        chunkExcerptCount: chunk.length,
                        chunkIndex: chunkIndex + 1,
                        chunkTotal: chunks.length,
                        excerptCount,
                        requestScope: request.scope,
                        requestTask: request.task,
                        startedAt,
                    },
                );
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

            console.log('responseText', responseText);

            let chunkCorrections: TranslationTextCorrection[];
            try {
                chunkCorrections = parseTextCorrectionResponse(responseText).map((correction) => {
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
                source: { kind: 'llm', model: MODEL, modelVersion, provider: 'google', task: request.task },
            },
            provider: 'google',
            scope: request.scope,
            task: request.task,
        };
    },
};

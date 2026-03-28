import '@tanstack/react-start/server-only';

import {
    buildArabicLeakCorrectionJsonSchema,
    buildArabicLeakCorrectionPrompt,
    parseArabicLeakCorrectionResponse,
} from '@/lib/llm/arabic-leak-prompt';
import type { TranslationAssistProvider } from '@/lib/llm/types';
import type { ArabicLeakCorrection, TranslationAssistRequest } from '@/lib/shell-types';

const DEFAULT_MAX_EXCERPTS_PER_REQUEST = 10;
const INTER_BATCH_DELAY_MS = { max: 900, min: 300 } as const;
const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

export const CLOUD_FLARE_PROVIDER_ID = 'cloudflare';

const requireCloudflareToken = () => {
    const token = process.env.CLOUDFLARE_WORKERS_AI_TOKEN?.trim();
    if (!token) {
        throw new Error('CLOUDFLARE_WORKERS_AI_TOKEN is not set on the server.');
    }
    return token;
};

const requireCloudflareAccountId = () => {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
    if (!accountId) {
        throw new Error('CLOUDFLARE_ACCOUNT_ID is not set on the server.');
    }
    return accountId;
};

const getCloudflareRunUrl = () =>
    `https://api.cloudflare.com/client/v4/accounts/${requireCloudflareAccountId()}/ai/run/${MODEL}`;

const getMaxExcerptsPerRequest = () => {
    const configuredValue = Number.parseInt(process.env.LLM_ASSIST_MAX_EXCERPTS_PER_REQUEST ?? '', 10);
    if (!Number.isFinite(configuredValue) || configuredValue < 1) {
        return DEFAULT_MAX_EXCERPTS_PER_REQUEST;
    }
    return configuredValue;
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

const getInterBatchDelayMs = () =>
    INTER_BATCH_DELAY_MS.min + Math.floor(Math.random() * (INTER_BATCH_DELAY_MS.max - INTER_BATCH_DELAY_MS.min + 1));

const getMissingExcerpts = (
    requestedExcerpts: TranslationAssistRequest['excerpts'],
    corrections: ArabicLeakCorrection[],
) => {
    const correctedIds = new Set(corrections.map((correction) => correction.id));
    return requestedExcerpts.filter((excerpt) => !correctedIds.has(excerpt.id));
};

const getResponsePreview = (rawText: string, maxLength = 1500) =>
    rawText.length <= maxLength
        ? rawText
        : `${rawText.slice(0, maxLength)}... [truncated ${rawText.length - maxLength} chars]`;

const getStructuredPreview = (value: unknown, maxLength = 3000) => {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    return getResponsePreview(serialized, maxLength);
};

const getTextFromContentItem = (item: unknown): string => {
    if (typeof item === 'string') {
        return item;
    }

    if (typeof item === 'object' && item !== null) {
        if ('text' in item && typeof item.text === 'string') {
            return item.text;
        }

        if ('response' in item && typeof item.response === 'string') {
            return item.response;
        }
    }

    return '';
};

const getResponseText = (content: unknown): string => {
    if (typeof content === 'string') {
        return content.trim();
    }

    if (Array.isArray(content)) {
        return content.map(getTextFromContentItem).join('').trim();
    }

    if (typeof content === 'object' && content !== null) {
        const extractedText = getTextFromContentItem(content).trim();
        if (extractedText) {
            return extractedText;
        }

        return JSON.stringify(content);
    }

    return '';
};

const serializeError = (error: unknown) => {
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

const requestChunkCorrections = async (chunk: TranslationAssistRequest['excerpts']) => {
    const excerptById = new Map<string, TranslationAssistRequest['excerpts'][number]>();

    for (const excerpt of chunk) {
        const existingExcerpt = excerptById.get(excerpt.id);
        if (existingExcerpt && existingExcerpt.filePath !== excerpt.filePath) {
            throw new Error(`Duplicate excerpt id "${excerpt.id}" detected across multiple files in the same batch.`);
        }
        excerptById.set(excerpt.id, excerpt);
    }

    const outboundExcerpts = chunk.map(({ arabic, id, leakHints, translation }) => ({
        arabic,
        id,
        leakHints: leakHints && leakHints.length > 0 ? leakHints : undefined,
        translation,
    }));
    const prompt = buildArabicLeakCorrectionPrompt(chunk);
    const responseSchema = buildArabicLeakCorrectionJsonSchema(chunk);

    console.info('[cloudflare] outbound request payload', {
        excerptCount: chunk.length,
        excerptsPreview: getStructuredPreview(outboundExcerpts),
        model: MODEL,
        promptPreview: getResponsePreview(prompt, 4000),
        responseSchemaPreview: getStructuredPreview(responseSchema, 4000),
    });

    const response = await fetch(getCloudflareRunUrl(), {
        body: JSON.stringify({
            messages: [
                {
                    content:
                        'You are a precise Arabic-to-English Islamic translation QA assistant. Return valid JSON only.',
                    role: 'system',
                },
                { content: prompt, role: 'user' },
            ],
            response_format: {
                json_schema: { name: 'arabic_leak_corrections', schema: responseSchema },
                type: 'json_schema',
            },
            temperature: 0,
        }),
        headers: { Authorization: `Bearer ${requireCloudflareToken()}`, 'Content-Type': 'application/json' },
        method: 'POST',
    });

    const rawText = await response.text();
    console.info('[cloudflare] raw response payload', {
        model: MODEL,
        ok: response.ok,
        preview: getResponsePreview(rawText),
        status: response.status,
        statusText: response.statusText,
    });

    if (!response.ok) {
        throw new Error(`Cloudflare Workers AI request failed (${response.status}): ${rawText}`);
    }

    const payload = JSON.parse(rawText) as {
        errors?: unknown[];
        messages?: unknown[];
        result?: { response?: string };
        success?: boolean;
    };

    console.info('[cloudflare] parsed response payload', {
        errors: payload.errors,
        messages: payload.messages,
        model: MODEL,
        resultPreview: getStructuredPreview(payload.result),
        success: payload.success,
    });

    const responseText = getResponseText(payload.result?.response);
    if (!responseText) {
        throw new Error('Cloudflare Workers AI returned an empty response.');
    }

    console.info('[cloudflare] decoded assistant content', {
        model: MODEL,
        preview: getResponsePreview(responseText, 4000),
    });

    const corrections = parseArabicLeakCorrectionResponse(responseText).map((correction) => {
        const excerpt = excerptById.get(correction.id);
        if (!excerpt) {
            throw new Error(`Cloudflare returned a correction for unknown excerpt id "${correction.id}".`);
        }

        return { ...correction, filePath: excerpt.filePath };
    });

    console.info('[cloudflare] mapped corrections', {
        correctionCount: corrections.length,
        correctionsPreview: getStructuredPreview(corrections),
        model: MODEL,
    });

    return corrections;
};

export const isCloudflareAssistConfigured = () =>
    Boolean(process.env.CLOUDFLARE_WORKERS_AI_TOKEN?.trim() && process.env.CLOUDFLARE_ACCOUNT_ID?.trim());

export const getCloudflareAssistModel = () => MODEL;

export const cloudflareTranslationAssistProvider: TranslationAssistProvider = {
    id: CLOUD_FLARE_PROVIDER_ID,
    model: MODEL,
    requestAssistance: async (request) => {
        const startedAt = performance.now();
        const chunks = chunkAssistRequest(request);

        console.info('[cloudflare] assist request', {
            chunkCount: chunks.length,
            excerptCount: request.excerpts.length,
            maxExcerptsPerRequest: getMaxExcerptsPerRequest(),
            model: MODEL,
            scope: request.scope,
            task: request.task,
        });

        const corrections: ArabicLeakCorrection[] = [];

        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
            const chunk = chunks[chunkIndex];
            const chunkStartedAt = performance.now();

            console.info('[cloudflare] assist chunk request', {
                chunkExcerptCount: chunk.length,
                chunkIndex: chunkIndex + 1,
                chunkTotal: chunks.length,
                model: MODEL,
            });

            try {
                const chunkCorrections = await requestChunkCorrections(chunk);
                const mergedChunkCorrections = [...chunkCorrections];
                const missingExcerpts = getMissingExcerpts(chunk, chunkCorrections);

                if (missingExcerpts.length > 0 && chunk.length > 1) {
                    console.warn('[cloudflare] assist chunk partial response', {
                        chunkExcerptCount: chunk.length,
                        chunkIndex: chunkIndex + 1,
                        chunkTotal: chunks.length,
                        missingExcerptIds: missingExcerpts.map((excerpt) => excerpt.id),
                        model: MODEL,
                        returnedCorrectionCount: chunkCorrections.length,
                    });

                    for (let missingIndex = 0; missingIndex < missingExcerpts.length; missingIndex += 1) {
                        const missingExcerpt = missingExcerpts[missingIndex];
                        const retryCorrections = await requestChunkCorrections([missingExcerpt]);
                        mergedChunkCorrections.push(...retryCorrections);

                        console.info('[cloudflare] assist single-excerpt retry response', {
                            excerptId: missingExcerpt.id,
                            model: MODEL,
                            retryCorrectionCount: retryCorrections.length,
                        });

                        if (missingIndex < missingExcerpts.length - 1) {
                            await sleep(getInterBatchDelayMs());
                        }
                    }
                }

                corrections.push(...mergedChunkCorrections);

                console.info('[cloudflare] assist chunk response', {
                    chunkCorrectionCount: mergedChunkCorrections.length,
                    chunkDurationMs: Math.round(performance.now() - chunkStartedAt),
                    chunkIndex: chunkIndex + 1,
                    chunkTotal: chunks.length,
                    model: MODEL,
                });
            } catch (error) {
                console.error('[cloudflare] assist request failed', {
                    chunkExcerptCount: chunk.length,
                    chunkIndex: chunkIndex + 1,
                    chunkTotal: chunks.length,
                    durationMs: Math.round(performance.now() - startedAt),
                    error: serializeError(error),
                    excerptCount: request.excerpts.length,
                    model: MODEL,
                    scope: request.scope,
                    task: request.task,
                });
                throw error;
            }

            if (chunkIndex < chunks.length - 1) {
                const delayMs = getInterBatchDelayMs();
                console.info('[cloudflare] assist inter-batch delay', {
                    chunkIndex: chunkIndex + 1,
                    delayMs,
                    remainingChunks: chunks.length - chunkIndex - 1,
                });
                await sleep(delayMs);
            }
        }

        console.info('[cloudflare] assist response', {
            chunkCount: chunks.length,
            correctionCount: corrections.length,
            durationMs: Math.round(performance.now() - startedAt),
            excerptCount: request.excerpts.length,
            model: MODEL,
        });

        return {
            corrections,
            model: MODEL,
            patchMetadata: {
                appliedAt: new Date().toISOString(),
                source: { kind: 'llm', model: MODEL, provider: 'cloudflare', task: 'arabic_leak_correction' },
            },
            provider: 'cloudflare',
            scope: request.scope,
            task: request.task,
        };
    },
};

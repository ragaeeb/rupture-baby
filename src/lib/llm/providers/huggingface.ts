import '@tanstack/react-start/server-only';

import { buildArabicLeakCorrectionPrompt, parseTextCorrectionResponse } from '@/lib/llm/arabic-leak-prompt';
import { buildAllCapsCorrectionPrompt } from '@/lib/llm/all-caps-prompt';
import type { TranslationAssistProvider } from '@/lib/llm/types';
import type { TranslationAssistRequest, TranslationTextCorrection } from '@/lib/shell-types';

const DEFAULT_MAX_EXCERPTS_PER_REQUEST = 10;
const DEFAULT_MODEL = 'meta-llama/Llama-3.3-70B-Instruct';
const HUGGING_FACE_CHAT_COMPLETIONS_URL = 'https://router.huggingface.co/v1/chat/completions';
const INTER_BATCH_DELAY_MS = { max: 900, min: 300 } as const;
export const HUGGING_FACE_PROVIDER_ID = 'hf';

const requireHuggingFaceToken = () => {
    const token = process.env.HF_MODEL_TOKEN?.trim();
    if (!token) {
        throw new Error('HF_MODEL_TOKEN is not set on the server.');
    }
    return token;
};

const getHuggingFaceModel = () => process.env.HF_MODEL_ID?.trim() || DEFAULT_MODEL;

const getMaxExcerptsPerRequest = () => {
    const configuredValue = Number.parseInt(
        process.env.LLM_ASSIST_MAX_EXCERPTS_PER_REQUEST ?? process.env.GEMINI_ASSIST_MAX_EXCERPTS_PER_REQUEST ?? '',
        10,
    );

    if (!Number.isFinite(configuredValue) || configuredValue < 1) {
        return DEFAULT_MAX_EXCERPTS_PER_REQUEST;
    }

    return configuredValue;
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

const getResponseText = (content: unknown) => {
    if (typeof content === 'string') {
        return content.trim();
    }

    if (Array.isArray(content)) {
        return content
            .map((item) => {
                if (typeof item === 'string') {
                    return item;
                }

                if (typeof item === 'object' && item !== null && 'text' in item && typeof item.text === 'string') {
                    return item.text;
                }

                return '';
            })
            .join('')
            .trim();
    }

    return '';
};

const getResponsePreview = (rawText: string, maxLength = 1500) =>
    rawText.length <= maxLength
        ? rawText
        : `${rawText.slice(0, maxLength)}... [truncated ${rawText.length - maxLength} chars]`;

const getStructuredPreview = (value: unknown, maxLength = 3000) => {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    return getResponsePreview(serialized, maxLength);
};

const requestChunkCorrections = async (request: TranslationAssistRequest, chunk: TranslationAssistRequest['excerpts']) => {
    const model = getHuggingFaceModel();
    const excerptById = new Map<string, TranslationAssistRequest['excerpts'][number]>();

    for (const excerpt of chunk) {
        const existingExcerpt = excerptById.get(excerpt.id);
        if (existingExcerpt && existingExcerpt.filePath !== excerpt.filePath) {
            throw new Error(`Duplicate excerpt id "${excerpt.id}" detected across multiple files in the same batch.`);
        }
        excerptById.set(excerpt.id, excerpt);
    }

    const outboundExcerpts = chunk.map(({ arabic, id, matchHints, translation }) => ({
        arabic,
        id,
        matchHints: matchHints && matchHints.length > 0 ? matchHints : undefined,
        translation,
    }));
    const prompt = buildPromptForTask(request, chunk);

    console.info('[huggingface] outbound request payload', {
        excerptCount: chunk.length,
        excerptsPreview: getStructuredPreview(outboundExcerpts),
        model,
        promptPreview: getResponsePreview(prompt, 4000),
    });

    const response = await fetch(HUGGING_FACE_CHAT_COMPLETIONS_URL, {
        body: JSON.stringify({
            messages: [
                {
                    content:
                        'You are a precise Arabic-to-English Islamic translation QA assistant. Return valid JSON only.',
                    role: 'system',
                },
                { content: prompt, role: 'user' },
            ],
            model,
            response_format: { type: 'json_object' },
            temperature: 0,
        }),
        headers: { Authorization: `Bearer ${requireHuggingFaceToken()}`, 'Content-Type': 'application/json' },
        method: 'POST',
    });

    const rawText = await response.text();
    console.info('[huggingface] raw response payload', {
        model,
        ok: response.ok,
        preview: getResponsePreview(rawText),
        status: response.status,
        statusText: response.statusText,
    });

    if (!response.ok) {
        throw new Error(`Hugging Face request failed (${response.status}): ${rawText}`);
    }

    const payload = JSON.parse(rawText) as {
        choices?: Array<{ message?: { content?: unknown } }>;
        id?: string;
        model?: string;
        usage?: unknown;
    };

    console.info('[huggingface] parsed response payload', {
        choiceCount: payload.choices?.length ?? 0,
        model: payload.model ?? model,
        responseId: payload.id,
        usage: payload.usage,
    });

    const responseText = getResponseText(payload.choices?.[0]?.message?.content);
    if (!responseText) {
        throw new Error('Hugging Face returned an empty response.');
    }

    console.info('[huggingface] decoded assistant content', {
        model: payload.model ?? model,
        preview: getResponsePreview(responseText, 4000),
        responseId: payload.id,
    });

    const corrections = parseTextCorrectionResponse(responseText).map((correction) => {
        const excerpt = excerptById.get(correction.id);
        if (!excerpt) {
            throw new Error(`Hugging Face returned a correction for unknown excerpt id "${correction.id}".`);
        }

        return { ...correction, filePath: excerpt.filePath };
    });

    console.info('[huggingface] mapped corrections', {
        correctionCount: corrections.length,
        correctionsPreview: getStructuredPreview(corrections),
        model: payload.model ?? model,
        responseId: payload.id,
    });

    return { corrections, model: payload.model ?? model, responseId: payload.id };
};

export const getHuggingFaceAssistModel = () => getHuggingFaceModel();
export const isHuggingFaceAssistConfigured = () => Boolean(process.env.HF_MODEL_TOKEN?.trim());

export const huggingFaceTranslationAssistProvider: TranslationAssistProvider = {
    id: HUGGING_FACE_PROVIDER_ID,
    model: getHuggingFaceModel(),
    requestAssistance: async (request) => {
        const startedAt = performance.now();
        const excerptCount = request.excerpts.length;
        const chunks = chunkAssistRequest(request);
        const model = getHuggingFaceModel();
        const maxExcerptsPerRequest = getMaxExcerptsPerRequest();

        console.info('[huggingface] assist request', {
            chunkCount: chunks.length,
            excerptCount,
            maxExcerptsPerRequest,
            model,
            scope: request.scope,
            task: request.task,
        });

        const corrections: TranslationTextCorrection[] = [];

        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
            const chunk = chunks[chunkIndex];
            const chunkStartedAt = performance.now();

            console.info('[huggingface] assist chunk request', {
                chunkExcerptCount: chunk.length,
                chunkIndex: chunkIndex + 1,
                chunkTotal: chunks.length,
                model,
            });

            try {
                const chunkResult = await requestChunkCorrections(request, chunk);
                corrections.push(...chunkResult.corrections);

                console.info('[huggingface] assist chunk response', {
                    chunkCorrectionCount: chunkResult.corrections.length,
                    chunkDurationMs: Math.round(performance.now() - chunkStartedAt),
                    chunkIndex: chunkIndex + 1,
                    chunkTotal: chunks.length,
                    model: chunkResult.model,
                    responseId: chunkResult.responseId,
                });
            } catch (error) {
                console.error('[huggingface] assist request failed', {
                    chunkExcerptCount: chunk.length,
                    chunkIndex: chunkIndex + 1,
                    chunkTotal: chunks.length,
                    durationMs: Math.round(performance.now() - startedAt),
                    error: serializeError(error),
                    excerptCount,
                    model,
                    scope: request.scope,
                    task: request.task,
                });
                throw error;
            }

            if (chunkIndex < chunks.length - 1) {
                const delayMs = getInterBatchDelayMs();
                console.info('[huggingface] assist inter-batch delay', {
                    chunkIndex: chunkIndex + 1,
                    delayMs,
                    remainingChunks: chunks.length - chunkIndex - 1,
                });
                await sleep(delayMs);
            }
        }

        console.info('[huggingface] assist response', {
            chunkCount: chunks.length,
            correctionCount: corrections.length,
            durationMs: Math.round(performance.now() - startedAt),
            excerptCount,
            model,
        });

        return {
            corrections,
            model,
            patchMetadata: {
                appliedAt: new Date().toISOString(),
                source: { kind: 'llm', model, provider: 'huggingface', task: request.task },
            },
            provider: 'huggingface',
            scope: request.scope,
            task: request.task,
        };
    },
};
const buildPromptForTask = (request: TranslationAssistRequest, excerpts: TranslationAssistRequest['excerpts']) =>
    request.task === 'all_caps_correction'
        ? buildAllCapsCorrectionPrompt(excerpts)
        : buildArabicLeakCorrectionPrompt(excerpts);

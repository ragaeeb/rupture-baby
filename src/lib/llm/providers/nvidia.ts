import '@tanstack/react-start/server-only';

import { buildAllCapsCorrectionPrompt } from '@/lib/llm/all-caps-prompt';
import { buildArabicLeakCorrectionPrompt, parseTextCorrectionResponse } from '@/lib/llm/arabic-leak-prompt';
import type { TranslationAssistProvider } from '@/lib/llm/types';
import type { TranslationAssistRequest, TranslationTextCorrection } from '@/lib/shell-types';

const DEFAULT_MAX_EXCERPTS_PER_REQUEST = 5;
const DEFAULT_MAX_TOKENS = 4096;
const INTER_BATCH_DELAY_MS = { max: 900, min: 300 } as const;
const NVIDIA_CHAT_COMPLETIONS_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_STATUS_URL = 'https://integrate.api.nvidia.com/v1/status';
const NVIDIA_ASSIST_SYSTEM_PROMPT =
    'You are a precise Arabic-to-English Islamic translation QA assistant. Return valid JSON only.';
const NVIDIA_STATUS_POLL_DELAY_MS = 500;
const NVIDIA_STATUS_POLL_MAX_ATTEMPTS = 60;

export const NVIDIA_GLM47_PROVIDER_ID = 'nvidia-glm47';
export const NVIDIA_KIMI_K2_THINKING_PROVIDER_ID = 'nvidia-kimi-k2-thinking';
export const NVIDIA_GLM47_MODEL = 'z-ai/glm4.7';
export const NVIDIA_KIMI_K2_THINKING_MODEL = 'moonshotai/kimi-k2-thinking';

type NvidiaProviderConfig = {
    id: typeof NVIDIA_GLM47_PROVIDER_ID | typeof NVIDIA_KIMI_K2_THINKING_PROVIDER_ID;
    model: string;
};

type NvidiaResponsePayload = {
    choices?: Array<{ message?: { content?: unknown } }>;
    id?: string;
    model?: string;
    model_version?: string;
    requestId?: string;
    usage?: unknown;
};

const requireNvidiaApiKey = () => {
    const apiKey = process.env.NVIDIA_API_KEY?.trim() || process.env.NVIDIA_NIM_API_KEY?.trim();
    if (!apiKey) {
        throw new Error('NVIDIA_API_KEY is not set on the server.');
    }

    return apiKey;
};

const getMaxExcerptsPerRequest = () => {
    const configuredValue = Number.parseInt(
        process.env.LLM_ASSIST_MAX_EXCERPTS_PER_REQUEST ?? process.env.NVIDIA_ASSIST_MAX_EXCERPTS_PER_REQUEST ?? '',
        10,
    );

    if (!Number.isFinite(configuredValue) || configuredValue < 1) {
        return DEFAULT_MAX_EXCERPTS_PER_REQUEST;
    }

    return configuredValue;
};

const getMaxOutputTokens = () => {
    const configuredValue = Number.parseInt(process.env.NVIDIA_ASSIST_MAX_OUTPUT_TOKENS ?? '', 10);

    if (!Number.isFinite(configuredValue) || configuredValue < 1) {
        return DEFAULT_MAX_TOKENS;
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

const buildPromptForTask = (request: TranslationAssistRequest, excerpts: TranslationAssistRequest['excerpts']) =>
    request.task === 'all_caps_correction'
        ? buildAllCapsCorrectionPrompt(excerpts)
        : buildArabicLeakCorrectionPrompt(excerpts);

const extractNvidiaRequestId = (response: Response, rawText: string) => {
    const headerRequestId =
        response.headers.get('nvcf-reqid') ??
        response.headers.get('x-request-id') ??
        response.headers.get('request-id') ??
        response.headers.get('x-nvidia-request-id');

    if (headerRequestId?.trim()) {
        return headerRequestId.trim();
    }

    if (!rawText.trim()) {
        return null;
    }

    try {
        const payload = JSON.parse(rawText) as { id?: unknown; requestId?: unknown; request_id?: unknown };
        if (typeof payload.requestId === 'string' && payload.requestId.trim()) {
            return payload.requestId.trim();
        }

        if (typeof payload.request_id === 'string' && payload.request_id.trim()) {
            return payload.request_id.trim();
        }

        if (typeof payload.id === 'string' && payload.id.trim()) {
            return payload.id.trim();
        }
    } catch {}

    return null;
};

const resolveNvidiaPendingResponse = async ({
    initialRawText,
    initialResponse,
    logLabel,
    model,
}: {
    initialRawText: string;
    initialResponse: Response;
    logLabel: string;
    model: string;
}) => {
    if (initialResponse.status !== 202) {
        return { rawText: initialRawText, response: initialResponse };
    }

    const requestId = extractNvidiaRequestId(initialResponse, initialRawText);
    if (!requestId) {
        throw new Error(
            `NVIDIA request returned 202 without a pollable request id: ${initialRawText || '[empty body]'}`,
        );
    }

    console.info(`${logLabel} assist poll start`, { model, requestId });

    for (let attempt = 1; attempt <= NVIDIA_STATUS_POLL_MAX_ATTEMPTS; attempt += 1) {
        await sleep(NVIDIA_STATUS_POLL_DELAY_MS);

        const pollResponse = await fetch(`${NVIDIA_STATUS_URL}/${encodeURIComponent(requestId)}`, {
            headers: { Accept: 'application/json', Authorization: `Bearer ${requireNvidiaApiKey()}` },
            method: 'GET',
        });
        const pollRawText = await pollResponse.text();

        console.info(`${logLabel} assist poll response`, {
            attempt,
            model,
            preview: getResponsePreview(pollRawText),
            requestId,
            status: pollResponse.status,
            statusText: pollResponse.statusText,
        });

        if (pollResponse.status === 202) {
            continue;
        }

        return { rawText: pollRawText, response: pollResponse };
    }

    throw new Error(
        `Timed out waiting for NVIDIA response after ${NVIDIA_STATUS_POLL_MAX_ATTEMPTS} status checks for request ${requestId}.`,
    );
};

const requestChunkCorrections = async (
    config: NvidiaProviderConfig,
    request: TranslationAssistRequest,
    chunk: TranslationAssistRequest['excerpts'],
) => {
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
    const logLabel = `[nvidia:${config.id}]`;

    console.info(`${logLabel} outbound request payload`, {
        excerptCount: chunk.length,
        excerptsPreview: getStructuredPreview(outboundExcerpts),
        model: config.model,
        promptPreview: getResponsePreview(prompt, 4000),
    });

    const initialResponse = await fetch(NVIDIA_CHAT_COMPLETIONS_URL, {
        body: JSON.stringify({
            max_tokens: getMaxOutputTokens(),
            messages: [
                { content: NVIDIA_ASSIST_SYSTEM_PROMPT, role: 'system' },
                { content: prompt, role: 'user' },
            ],
            model: config.model,
            stream: false,
            temperature: 0,
        }),
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${requireNvidiaApiKey()}`,
            'Content-Type': 'application/json',
        },
        method: 'POST',
    });

    const initialRawText = await initialResponse.text();
    console.info(`${logLabel} raw response payload`, {
        model: config.model,
        ok: initialResponse.ok,
        preview: getResponsePreview(initialRawText),
        status: initialResponse.status,
        statusText: initialResponse.statusText,
    });

    const { rawText, response } = await resolveNvidiaPendingResponse({
        initialRawText,
        initialResponse,
        logLabel,
        model: config.model,
    });

    if (!response.ok) {
        throw new Error(`NVIDIA request failed (${response.status}): ${rawText}`);
    }

    const payload = JSON.parse(rawText) as NvidiaResponsePayload;

    console.info(`${logLabel} parsed response payload`, {
        choiceCount: payload.choices?.length ?? 0,
        model: payload.model ?? config.model,
        modelVersion: payload.model_version,
        responseId: payload.id ?? payload.requestId,
        usage: payload.usage,
    });

    const responseText = getResponseText(payload.choices?.[0]?.message?.content);
    if (!responseText) {
        throw new Error('NVIDIA returned an empty response.');
    }

    console.info(`${logLabel} decoded assistant content`, {
        model: payload.model ?? config.model,
        preview: getResponsePreview(responseText, 4000),
        responseId: payload.id ?? payload.requestId,
    });

    const corrections = parseTextCorrectionResponse(responseText).map((correction) => {
        const excerpt = excerptById.get(correction.id);
        if (!excerpt) {
            throw new Error(`NVIDIA returned a correction for unknown excerpt id "${correction.id}".`);
        }

        return { ...correction, filePath: excerpt.filePath };
    });

    console.info(`${logLabel} mapped corrections`, {
        correctionCount: corrections.length,
        correctionsPreview: getStructuredPreview(corrections),
        model: payload.model ?? config.model,
        responseId: payload.id ?? payload.requestId,
    });

    return {
        corrections,
        model: payload.model ?? config.model,
        modelVersion: payload.model_version,
        responseId: payload.id ?? payload.requestId,
    };
};

const createNvidiaTranslationAssistProvider = (config: NvidiaProviderConfig): TranslationAssistProvider => ({
    id: config.id,
    model: config.model,
    requestAssistance: async (request) => {
        const startedAt = performance.now();
        const excerptCount = request.excerpts.length;
        const chunks = chunkAssistRequest(request);
        const logLabel = `[nvidia:${config.id}]`;

        console.info(`${logLabel} assist request`, {
            chunkCount: chunks.length,
            excerptCount,
            maxExcerptsPerRequest: getMaxExcerptsPerRequest(),
            maxOutputTokens: getMaxOutputTokens(),
            model: config.model,
            scope: request.scope,
            task: request.task,
        });

        const corrections: TranslationTextCorrection[] = [];
        let resolvedModel = config.model;
        let modelVersion: string | undefined;

        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
            const chunk = chunks[chunkIndex];
            const chunkStartedAt = performance.now();

            console.info(`${logLabel} assist chunk request`, {
                chunkExcerptCount: chunk.length,
                chunkIndex: chunkIndex + 1,
                chunkTotal: chunks.length,
                model: config.model,
            });

            try {
                const chunkResult = await requestChunkCorrections(config, request, chunk);
                corrections.push(...chunkResult.corrections);
                resolvedModel = chunkResult.model;
                modelVersion = chunkResult.modelVersion ?? modelVersion;

                console.info(`${logLabel} assist chunk response`, {
                    chunkCorrectionCount: chunkResult.corrections.length,
                    chunkDurationMs: Math.round(performance.now() - chunkStartedAt),
                    chunkIndex: chunkIndex + 1,
                    chunkTotal: chunks.length,
                    model: chunkResult.model,
                    modelVersion: chunkResult.modelVersion,
                    responseId: chunkResult.responseId,
                });
            } catch (error) {
                console.error(`${logLabel} assist request failed`, {
                    chunkExcerptCount: chunk.length,
                    chunkIndex: chunkIndex + 1,
                    chunkTotal: chunks.length,
                    durationMs: Math.round(performance.now() - startedAt),
                    error: serializeError(error),
                    excerptCount,
                    model: config.model,
                    scope: request.scope,
                    task: request.task,
                });
                throw error;
            }

            if (chunkIndex < chunks.length - 1) {
                const delayMs = getInterBatchDelayMs();
                console.info(`${logLabel} assist inter-batch delay`, {
                    chunkIndex: chunkIndex + 1,
                    delayMs,
                    remainingChunks: chunks.length - chunkIndex - 1,
                });
                await sleep(delayMs);
            }
        }

        console.info(`${logLabel} assist response`, {
            chunkCount: chunks.length,
            correctionCount: corrections.length,
            durationMs: Math.round(performance.now() - startedAt),
            excerptCount,
            model: resolvedModel,
            modelVersion,
        });

        return {
            corrections,
            model: resolvedModel,
            modelVersion,
            patchMetadata: {
                appliedAt: new Date().toISOString(),
                source: { kind: 'llm', model: resolvedModel, modelVersion, provider: 'nvidia', task: request.task },
            },
            provider: 'nvidia',
            scope: request.scope,
            task: request.task,
        };
    },
});

export const isNvidiaAssistConfigured = () =>
    Boolean(process.env.NVIDIA_API_KEY?.trim() || process.env.NVIDIA_NIM_API_KEY?.trim());

export const nvidiaGlm47TranslationAssistProvider = createNvidiaTranslationAssistProvider({
    id: NVIDIA_GLM47_PROVIDER_ID,
    model: NVIDIA_GLM47_MODEL,
});

export const nvidiaKimiK2ThinkingTranslationAssistProvider = createNvidiaTranslationAssistProvider({
    id: NVIDIA_KIMI_K2_THINKING_PROVIDER_ID,
    model: NVIDIA_KIMI_K2_THINKING_MODEL,
});

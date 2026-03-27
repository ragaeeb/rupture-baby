import '@tanstack/react-start/server-only';

import type { TranslationAssistProvider } from '@/lib/llm/types';
import type { ArabicLeakCorrection, TranslationAssistRequest } from '@/lib/shell-types';

const DEFAULT_MAX_EXCERPTS_PER_REQUEST = 10;
const DEFAULT_MODEL = 'meta-llama/Llama-3.3-70B-Instruct';
const HUGGING_FACE_CHAT_COMPLETIONS_URL = 'https://router.huggingface.co/v1/chat/completions';
const INTER_BATCH_DELAY_MS = { max: 900, min: 300 } as const;

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

const buildArabicLeakCorrectionPrompt = (excerpts: TranslationAssistRequest['excerpts']) => {
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

type ModelArabicLeakCorrection = Omit<ArabicLeakCorrection, 'filePath'>;

const isArabicLeakCorrection = (value: unknown): value is ModelArabicLeakCorrection =>
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'match' in value &&
    'replacement' in value &&
    typeof value.id === 'string' &&
    typeof value.match === 'string' &&
    typeof value.replacement === 'string';

const parseCorrectionResponse = (responseText: string): ModelArabicLeakCorrection[] => {
    const parsed = JSON.parse(responseText) as { corrections?: unknown };
    if (!Array.isArray(parsed.corrections) || !parsed.corrections.every(isArabicLeakCorrection)) {
        throw new Error('Hugging Face returned an invalid Arabic leak correction payload.');
    }

    return parsed.corrections.filter(
        (correction) =>
            correction.id.trim().length > 0 && correction.match.length > 0 && correction.replacement.length > 0,
    );
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

const requestChunkCorrections = async (chunk: TranslationAssistRequest['excerpts']) => {
    const model = getHuggingFaceModel();
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

    const corrections = parseCorrectionResponse(responseText).map((correction) => {
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

export const huggingFaceTranslationAssistProvider: TranslationAssistProvider = {
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

        const corrections: ArabicLeakCorrection[] = [];

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
                const chunkResult = await requestChunkCorrections(chunk);
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
                source: { kind: 'llm', model, provider: 'huggingface', task: 'arabic_leak_correction' },
            },
            provider: 'huggingface',
            scope: request.scope,
            task: request.task,
        };
    },
};

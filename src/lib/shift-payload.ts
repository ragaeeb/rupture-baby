import { estimateTokenCount, type LLMProvider } from 'bitaboom';

export type ShiftExcerpt = { id: string; nass: string };

type BuildShiftPayloadInput = {
    excerpts: ShiftExcerpt[];
    maxTokens: number;
    prompt: string;
    provider: LLMProvider;
    tokenEstimator?: (text: string, provider: LLMProvider) => number;
};

type BuildShiftPayloadOutput = { payload: string; shiftCount: number; usedTokens: number };

const toLine = (excerpt: ShiftExcerpt): string => `${excerpt.id} - ${excerpt.nass}`;

export const buildShiftPayload = ({
    excerpts,
    maxTokens,
    prompt,
    provider,
    tokenEstimator = estimateTokenCount,
}: BuildShiftPayloadInput): BuildShiftPayloadOutput => {
    const trimmedPrompt = prompt.trim();
    const promptTokens = tokenEstimator(trimmedPrompt, provider);

    if (promptTokens > maxTokens) {
        return { payload: '', shiftCount: 0, usedTokens: 0 };
    }

    const selectedLines: string[] = [];
    let usedTokens = promptTokens;

    for (const excerpt of excerpts) {
        const line = toLine(excerpt);
        const lineTokens = tokenEstimator(line, provider);

        if (usedTokens + lineTokens > maxTokens) {
            break;
        }

        usedTokens += lineTokens;
        selectedLines.push(line);
    }

    const payload =
        selectedLines.length === 0
            ? trimmedPrompt
            : trimmedPrompt.length === 0
              ? selectedLines.join('\n')
              : `${trimmedPrompt}\n\n${selectedLines.join('\n\n')}`;

    return { payload, shiftCount: selectedLines.length, usedTokens };
};

export const shiftFirstN = (queue: ShiftExcerpt[], count: number): ShiftExcerpt[] => {
    const shifted: ShiftExcerpt[] = [];

    for (let index = 0; index < count; index += 1) {
        const item = queue.shift();
        if (!item) {
            break;
        }
        shifted.push(item);
    }

    return shifted;
};

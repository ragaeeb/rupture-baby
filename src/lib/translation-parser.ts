import type { AITranslator, Excerpt } from '../types/compilation';
import { mapDateToSeconds } from './time';
import type {
    AIModel,
    BlackiyaOriginal,
    CommonConversationExport,
    GrokSingleConversation,
    LegacyWrapper,
    Message,
    MessageNode,
} from './translation-types';
import { parseTranslationsInOrder } from './validation/textUtils';
import type { Segment, ValidationError } from './validation/types';
import { validateTranslationResponse } from './validation/utils';

const COMMON_FORMAT_VALUE = 'common' as const;

const toIsoTimestamp = (seconds: number): string => new Date(seconds * 1000).toISOString();

const parseIsoTimestampToSeconds = (value: string | undefined): number | undefined => {
    if (!value) {
        return undefined;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return undefined;
    }

    return mapDateToSeconds(parsed);
};

const MODEL_PLACEHOLDERS = new Set(['auto', 'unknown', 'snapshot']);

const normalizeModel = (value: unknown): string | undefined => {
    if (typeof value !== 'string') {
        return undefined;
    }
    const normalized = value.trim();
    if (!normalized || MODEL_PLACEHOLDERS.has(normalized.toLowerCase())) {
        return undefined;
    }
    return normalized;
};

const inferProviderFromModel = (modelSlug: string): string => {
    const lower = modelSlug.toLowerCase();
    if (lower.includes('gemini') || lower.includes('bard')) {
        return 'Gemini';
    }
    if (lower.includes('grok')) {
        return 'Grok';
    }
    if (/^(gpt|o1|o3|o4|o5)/.test(lower) || lower.includes('chatgpt')) {
        return 'ChatGPT';
    }
    return 'Unknown';
};

const extractModelFromMessage = (message: Message) =>
    normalizeModel((message.metadata as Record<string, unknown>)?.resolved_model_slug) ||
    normalizeModel((message.metadata as Record<string, unknown>)?.model_slug) ||
    normalizeModel((message.metadata as Record<string, unknown>)?.default_model_slug) ||
    normalizeModel((message.metadata as Record<string, unknown>)?.model);

const extractModel = (conversation: BlackiyaOriginal, chain: Message[]): AIModel => {
    let model = normalizeModel(conversation.default_model_slug);

    for (let i = chain.length - 1; i >= 0; i -= 1) {
        const message = chain[i];

        if (message.author?.role !== 'assistant') {
            continue;
        }

        const metadataModel = extractModelFromMessage(message);

        if (metadataModel) {
            model = metadataModel;
            break;
        }
    }

    if (!model) {
        throw new Error('Could not detect model');
    }

    return model as AIModel;
};

const inferLlmName = (conversation: BlackiyaOriginal, chain: Message[]): string => {
    const model = extractModel(conversation, chain);
    if (model) {
        return inferProviderFromModel(model);
    }
    return inferProviderFromModel(conversation.default_model_slug);
};

const extractMessageText = (message: Message): string => {
    const parts = message.content?.parts;
    if (Array.isArray(parts) && parts.length > 0) {
        return parts
            .filter((part): part is string => typeof part === 'string')
            .join('\n')
            .trim();
    }
    if (typeof message.content?.content === 'string') {
        return message.content.content.trim();
    }
    return '';
};

const extractThoughtReasoning = (message: Message): string[] => {
    const thoughts = message.content?.thoughts;
    if (!Array.isArray(thoughts) || thoughts.length === 0) {
        return [];
    }
    return thoughts
        .map((thought) => (typeof thought?.content === 'string' ? thought.content.trim() : ''))
        .filter((content) => content.length > 0);
};

const extractReasoningRecap = (message: Message): string[] => {
    if (message.content?.content_type !== 'reasoning_recap') {
        return [];
    }
    const content = message.content?.content;
    if (typeof content === 'string' && content.trim().length > 0) {
        return [content.trim()];
    }
    return [];
};

const extractMetadataReasoning = (message: Message): string[] => {
    const metadata = message.metadata as Record<string, unknown> | undefined;
    if (!metadata) {
        return [];
    }
    const fragments: string[] = [];
    const reasoning = metadata.reasoning;
    const thinkingTrace = metadata.thinking_trace;
    if (typeof reasoning === 'string' && reasoning.trim()) {
        fragments.push(reasoning.trim());
    }
    if (typeof thinkingTrace === 'string' && thinkingTrace.trim()) {
        fragments.push(thinkingTrace.trim());
    }
    return fragments;
};

const extractReasoningFragments = (message: Message): string[] => [
    ...extractThoughtReasoning(message),
    ...extractReasoningRecap(message),
    ...extractMetadataReasoning(message),
];

const getMessageTimestamp = (message: Message): number => {
    if (typeof message.update_time === 'number' && Number.isFinite(message.update_time)) {
        return message.update_time;
    }
    if (typeof message.create_time === 'number' && Number.isFinite(message.create_time)) {
        return message.create_time;
    }
    return 0;
};

const getAssistantMessagesByRecency = (conversation: BlackiyaOriginal): Message[] =>
    Object.values(conversation.mapping)
        .map((node) => node.message)
        .filter((message): message is Message => !!message && message.author?.role === 'assistant')
        .sort((left, right) => getMessageTimestamp(right) - getMessageTimestamp(left));

const findCurrentNodeId = (conversation: BlackiyaOriginal): string | null => {
    const mapping = conversation.mapping;
    if (conversation.current_node && mapping[conversation.current_node]?.message) {
        return conversation.current_node;
    }
    const assistants = getAssistantMessagesByRecency(conversation);
    if (assistants.length > 0) {
        const firstAssistant = assistants[0];
        for (const [id, node] of Object.entries(mapping)) {
            if (node.message === firstAssistant) {
                return id;
            }
        }
    }
    return null;
};

const buildMessageChain = (mapping: Record<string, MessageNode>, startId: string): Message[] => {
    const chain: Message[] = [];
    let currentId: string | null = startId;
    const visited = new Set<string>();

    while (currentId && mapping[currentId] && !visited.has(currentId)) {
        visited.add(currentId);
        const node: MessageNode = mapping[currentId];
        if (node.message) {
            chain.unshift(node.message);
        }
        currentId = node.parent ?? null;
    }

    return chain;
};

const findTerminalAssistantIndex = (chain: Message[]): number => {
    for (let i = chain.length - 1; i >= 0; i -= 1) {
        const message = chain[i];
        if (message.author?.role !== 'assistant') {
            continue;
        }
        if (extractMessageText(message) || extractReasoningFragments(message).length > 0) {
            return i;
        }
    }
    return -1;
};

const findLastUserBefore = (chain: Message[], endIndex: number): number => {
    for (let i = endIndex - 1; i >= 0; i -= 1) {
        if (chain[i].author?.role === 'user') {
            return i;
        }
    }
    return -1;
};

const findLatestResponseText = (chain: Message[], startIndex: number, endIndex: number): string => {
    for (let i = endIndex; i > startIndex; i -= 1) {
        const message = chain[i];
        if (message.author?.role !== 'assistant') {
            continue;
        }
        const text = extractMessageText(message);
        if (text) {
            return text;
        }
    }
    return '';
};

const collectReasoningForRange = (chain: Message[], startIndex: number, endIndex: number): string[] => {
    const collected: string[] = [];
    for (let i = startIndex + 1; i <= endIndex; i += 1) {
        const message = chain[i];
        if (message.author?.role !== 'assistant') {
            continue;
        }
        collected.push(...extractReasoningFragments(message));
    }
    return [...new Set(collected.filter((value) => value.length > 0))];
};

const collectLatestAssistantReasoningFromMapping = (
    conversation: BlackiyaOriginal,
    minTimestampInclusive: number | null,
): string[] => {
    const assistants = getAssistantMessagesByRecency(conversation);
    for (const assistant of assistants) {
        if (typeof minTimestampInclusive === 'number' && getMessageTimestamp(assistant) < minTimestampInclusive) {
            continue;
        }
        const fragments = extractReasoningFragments(assistant);
        if (fragments.length > 0) {
            return [...new Set(fragments)];
        }
    }
    return [];
};

const extractLatestPrompt = (chain: Message[]): string => {
    for (let i = chain.length - 1; i >= 0; i -= 1) {
        const message = chain[i];
        if (message.author?.role === 'user') {
            return extractMessageText(message);
        }
    }
    return '';
};

const convertBlackiyaOriginalToCommon = (
    conversation: BlackiyaOriginal,
    llmName?: string,
): CommonConversationExport => {
    const currentNodeId = findCurrentNodeId(conversation);
    const chain = currentNodeId ? buildMessageChain(conversation.mapping, currentNodeId) : [];

    const assistantIndex = findTerminalAssistantIndex(chain);
    const userIndex = assistantIndex >= 0 ? findLastUserBefore(chain, assistantIndex) : -1;

    const prompt = userIndex >= 0 ? extractMessageText(chain[userIndex]) : extractLatestPrompt(chain);
    const response = assistantIndex >= 0 ? findLatestResponseText(chain, userIndex, assistantIndex) : '';
    const reasoningFromChain = assistantIndex >= 0 ? collectReasoningForRange(chain, userIndex, assistantIndex) : [];
    const minReasoningTimestamp: number | null =
        userIndex >= 0 && chain[userIndex] ? getMessageTimestamp(chain[userIndex]) : null;
    const reasoning =
        reasoningFromChain.length > 0
            ? reasoningFromChain
            : collectLatestAssistantReasoningFromMapping(conversation, minReasoningTimestamp);

    return {
        conversation_id: conversation.conversation_id || undefined,
        created_at: toIsoTimestamp(conversation.create_time),
        format: COMMON_FORMAT_VALUE,
        llm: llmName || inferLlmName(conversation, chain),
        model: extractModel(conversation, chain),
        prompt,
        reasoning,
        response,
        title: conversation.title || undefined,
        updated_at: toIsoTimestamp(conversation.update_time),
    };
};

const parseGrokConversation = (data: GrokSingleConversation): CommonConversationExport => {
    const response = data.responses.length > 0 ? data.responses[data.responses.length - 1].response.message : '';

    return {
        conversation_id: data.conversation.id,
        created_at: data.conversation.create_time,
        format: COMMON_FORMAT_VALUE,
        llm: 'Grok',
        prompt: '',
        reasoning: [],
        response,
        title: data.conversation.title || undefined,
        updated_at: data.conversation.modify_time,
    };
};

const isBlackiyaOriginal = (data: unknown): data is BlackiyaOriginal => {
    if (typeof data !== 'object' || data === null) {
        return false;
    }
    const obj = data as Record<string, unknown>;
    return (
        typeof obj.title === 'string' &&
        typeof obj.create_time === 'number' &&
        typeof obj.update_time === 'number' &&
        typeof obj.mapping === 'object' &&
        obj.mapping !== null &&
        typeof obj.conversation_id === 'string' &&
        typeof obj.current_node === 'string' &&
        Array.isArray(obj.moderation_results) &&
        (obj.plugin_ids === null || Array.isArray(obj.plugin_ids)) &&
        typeof obj.default_model_slug === 'string' &&
        Array.isArray(obj.safe_urls) &&
        Array.isArray(obj.blocked_urls)
    );
};

const isGrokConversation = (data: unknown): data is GrokSingleConversation => {
    if (typeof data !== 'object' || data === null) {
        return false;
    }
    const obj = data as Record<string, unknown>;
    // Check for the structure of a single conversation (no array wrapper)
    if (!obj.conversation || typeof obj.conversation !== 'object') {
        return false;
    }
    const conv = obj.conversation as Record<string, unknown>;
    if (typeof conv.id !== 'string') {
        return false;
    }
    if (!Array.isArray(obj.responses)) {
        return false;
    }
    return true;
};

const isLegacyWrapper = (data: unknown): data is LegacyWrapper => {
    if (typeof data !== 'object' || data === null) {
        return false;
    }
    const obj = data as Record<string, unknown>;
    return 'format' in obj || 'data' in obj || 'payload' in obj || '__blackiya' in obj;
};

const resolveBlackiyaMeta = (payload: unknown): Record<string, unknown> | null => {
    if (!isLegacyWrapper(payload)) {
        return null;
    }
    if (payload.__blackiya && typeof payload.__blackiya === 'object') {
        return payload.__blackiya as Record<string, unknown>;
    }
    if (typeof payload.data === 'object' && payload.data !== null) {
        const dataObj = payload.data as Record<string, unknown>;
        if (dataObj.__blackiya && typeof dataObj.__blackiya === 'object') {
            return dataObj.__blackiya as Record<string, unknown>;
        }
    }
    return null;
};

const resolveRuptureMeta = (payload: unknown): CommonConversationExport['__rupture'] | null => {
    if (typeof payload !== 'object' || payload === null) {
        return null;
    }

    const objectPayload = payload as Record<string, unknown>;
    if (typeof objectPayload.__rupture === 'object' && objectPayload.__rupture !== null) {
        return objectPayload.__rupture as CommonConversationExport['__rupture'];
    }

    if (typeof objectPayload.data === 'object' && objectPayload.data !== null) {
        const nestedData = objectPayload.data as Record<string, unknown>;
        if (typeof nestedData.__rupture === 'object' && nestedData.__rupture !== null) {
            return nestedData.__rupture as CommonConversationExport['__rupture'];
        }
    }

    return null;
};

const attachRuptureMeta = (conversation: CommonConversationExport, payload: unknown): CommonConversationExport => {
    const ruptureMeta = resolveRuptureMeta(payload);
    return ruptureMeta ? { ...conversation, __rupture: ruptureMeta } : conversation;
};

const parseLegacyWrapper = (data: LegacyWrapper): CommonConversationExport | null => {
    if (data.format === 'original' && isBlackiyaOriginal(data.data)) {
        const common = convertBlackiyaOriginalToCommon(data.data);
        const blackiyaMeta = resolveBlackiyaMeta(data);
        if (blackiyaMeta) {
            return { ...common, __blackiya: blackiyaMeta };
        }
        return common;
    }

    if (isBlackiyaOriginal(data.payload)) {
        return convertBlackiyaOriginalToCommon(data.payload);
    }

    if (typeof data.data === 'object' && data.data !== null) {
        const dataObj = data.data as Record<string, unknown>;
        if (isBlackiyaOriginal(dataObj.payload)) {
            return convertBlackiyaOriginalToCommon(dataObj.payload as BlackiyaOriginal);
        }
    }

    return null;
};

const isCommonConversationExport = (data: unknown): data is CommonConversationExport =>
    typeof data === 'object' &&
    data !== null &&
    'format' in data &&
    (data as CommonConversationExport).format === 'common';

export const parseTranslationToCommon = (data: unknown): CommonConversationExport => {
    // Check for Grok conversation first (most common format)
    if (isGrokConversation(data)) {
        return attachRuptureMeta(parseGrokConversation(data), data);
    }

    if (isBlackiyaOriginal(data)) {
        return attachRuptureMeta(convertBlackiyaOriginalToCommon(data), data);
    }

    if (isLegacyWrapper(data)) {
        const parsed = parseLegacyWrapper(data);
        if (parsed) {
            return attachRuptureMeta(parsed, data);
        }
    }

    if (isCommonConversationExport(data)) {
        return data;
    }

    throw new Error('Input does not match a supported translation JSON shape.');
};

const mapTranslatorToId = (model: string): AITranslator => {
    if (model === 'gemini-3-pro') {
        return 901;
    }

    if (model === 'gpt-5-4-pro') {
        return 903;
    }

    if (model === 'gpt-5-4-thinking') {
        return 900;
    }

    if (model === 'grok-4') {
        return 895;
    }

    throw new Error(`Invalid model: ${model}`);
};

export type ConversationExcerptsValidation = {
    arabicSegments: Segment[];
    excerpts: Excerpt[];
    translatedSegments: Segment[];
    validationErrors: ValidationError[];
};

const buildResponseAlignmentErrors = (
    arabicSegments: Segment[],
    translatedSegments: Segment[],
    response: string,
): ValidationError[] => {
    const errors: ValidationError[] = [];
    const expectedIds = arabicSegments.map((segment) => segment.id);
    const translatedIds = translatedSegments.map((segment) => segment.id);
    const expectedIdsSet = new Set(expectedIds);
    const translatedIdsSet = new Set(translatedIds);
    const duplicateCounts = new Map<string, number>();

    for (const id of translatedIds) {
        duplicateCounts.set(id, (duplicateCounts.get(id) ?? 0) + 1);
    }

    for (const [id, count] of duplicateCounts.entries()) {
        if (count > 1) {
            errors.push({
                id,
                matchText: id,
                message: `Duplicate translated ID "${id}" found ${count} times in the response.`,
                range: { end: response.length, start: 0 },
                ruleId: 'duplicate_id',
                type: 'duplicate_id',
            });
        }
    }

    const inventedIds = translatedIds.filter((id) => !expectedIdsSet.has(id));
    for (const id of inventedIds) {
        errors.push({
            id,
            matchText: id,
            message: `Translated response contains ID "${id}" which does not exist in the Arabic source.`,
            range: { end: response.length, start: 0 },
            ruleId: 'invented_id',
            type: 'invented_id',
        });
    }

    const missingIds = expectedIds.filter((id) => !translatedIdsSet.has(id));
    if (missingIds.length > 0) {
        errors.push({
            matchText: missingIds.join(', '),
            message: `Translated response is missing source IDs: ${missingIds.join(', ')}.`,
            range: { end: response.length, start: 0 },
            ruleId: 'missing_id_gap',
            type: 'missing_id_gap',
        });
    }

    const sharedLength = Math.min(expectedIds.length, translatedIds.length);
    for (let i = 0; i < sharedLength; i += 1) {
        if (expectedIds[i] === translatedIds[i]) {
            continue;
        }

        errors.push({
            id: translatedIds[i],
            matchText: translatedIds[i] ?? '',
            message: `Translated response is out of order at position ${i + 1}: expected "${expectedIds[i]}", received "${translatedIds[i]}".`,
            range: { end: response.length, start: 0 },
            ruleId: 'missing_id_gap',
            type: 'missing_id_gap',
        });
        break;
    }

    return errors;
};

export const validateConversationExcerpts = (c: CommonConversationExport): ConversationExcerptsValidation => {
    const arabic = c.prompt.substring(c.prompt.indexOf('\n\n')).trim();
    const arabicSegments = parseTranslationsInOrder(arabic);
    const translatedSegments = parseTranslationsInOrder(c.response);
    const validatorResult = validateTranslationResponse(arabicSegments, c.response);
    const alignmentErrors = buildResponseAlignmentErrors(arabicSegments, translatedSegments, c.response);
    const validationErrors = [...validatorResult.errors, ...alignmentErrors];

    if (validationErrors.length > 0) {
        return { arabicSegments, excerpts: [], translatedSegments, validationErrors };
    }

    const lastUpdatedAt = parseIsoTimestampToSeconds(c.updated_at) ?? parseIsoTimestampToSeconds(c.created_at);
    const excerpts = arabicSegments.map((e, i) => {
        return {
            from: 0,
            id: e.id,
            lastUpdatedAt,
            nass: e.text,
            text: translatedSegments[i].text,
            translator: mapTranslatorToId(c.model!),
        } satisfies Excerpt;
    });

    return { arabicSegments, excerpts, translatedSegments, validationErrors: [] };
};

export const mapConversationToExcerpts = (c: CommonConversationExport): Excerpt[] => {
    return validateConversationExcerpts(c).excerpts;
};

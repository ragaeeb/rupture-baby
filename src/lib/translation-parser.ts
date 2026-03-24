import type {
    BlackiyaOriginal,
    CommonConversationExport,
    GrokMassExport,
    LegacyWrapper,
    Message,
    MessageNode,
} from './translation-types';

const COMMON_FORMAT_VALUE = 'common' as const;

const toIsoTimestamp = (seconds: number): string => new Date(seconds * 1000).toISOString();

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

const extractModelFromMessage = (message: Message): string | undefined =>
    normalizeModel((message.metadata as Record<string, unknown>)?.resolved_model_slug) ||
    normalizeModel((message.metadata as Record<string, unknown>)?.model_slug) ||
    normalizeModel((message.metadata as Record<string, unknown>)?.default_model_slug) ||
    normalizeModel((message.metadata as Record<string, unknown>)?.model);

const extractModel = (conversation: BlackiyaOriginal, chain: Message[]): string | undefined => {
    for (let i = chain.length - 1; i >= 0; i -= 1) {
        const message = chain[i];
        if (message.author?.role !== 'assistant') {
            continue;
        }
        const metadataModel = extractModelFromMessage(message);
        if (metadataModel) {
            return metadataModel;
        }
    }
    return normalizeModel(conversation.default_model_slug);
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

const parseGrokMassExport = (data: GrokMassExport): CommonConversationExport[] => {
    if (!Array.isArray(data.conversations)) {
        return [];
    }

    return data.conversations.map((conv) => {
        const response = conv.responses.length > 0 ? conv.responses[conv.responses.length - 1].response.message : '';

        return {
            conversation_id: conv.conversation.id,
            created_at: conv.conversation.create_time,
            format: COMMON_FORMAT_VALUE,
            llm: 'Grok',
            prompt: '',
            reasoning: [],
            response,
            title: conv.conversation.title || undefined,
            updated_at: conv.conversation.modify_time,
        };
    });
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

const isGrokMassExport = (data: unknown): data is GrokMassExport => {
    if (typeof data !== 'object' || data === null) {
        return false;
    }
    const obj = data as Record<string, unknown>;
    return Array.isArray(obj.conversations);
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

const parseLegacyWrapper = (data: LegacyWrapper): CommonConversationExport[] | null => {
    if (data.format === 'original' && isBlackiyaOriginal(data.data)) {
        const common = convertBlackiyaOriginalToCommon(data.data);
        const blackiyaMeta = resolveBlackiyaMeta(data);
        if (blackiyaMeta) {
            return [{ ...common, __blackiya: blackiyaMeta }];
        }
        return [common];
    }

    if (isBlackiyaOriginal(data.payload)) {
        return [convertBlackiyaOriginalToCommon(data.payload)];
    }

    if (typeof data.data === 'object' && data.data !== null) {
        const dataObj = data.data as Record<string, unknown>;
        if (isBlackiyaOriginal(dataObj.payload)) {
            return [convertBlackiyaOriginalToCommon(dataObj.payload as BlackiyaOriginal)];
        }
    }

    return null;
};

const isCommonConversationExport = (data: unknown): data is CommonConversationExport =>
    typeof data === 'object' &&
    data !== null &&
    'format' in data &&
    (data as CommonConversationExport).format === 'common';

export const parseTranslationToCommon = (data: unknown): CommonConversationExport[] => {
    if (isGrokMassExport(data)) {
        return parseGrokMassExport(data);
    }

    if (isBlackiyaOriginal(data)) {
        return [convertBlackiyaOriginalToCommon(data)];
    }

    if (isLegacyWrapper(data)) {
        const parsed = parseLegacyWrapper(data);
        if (parsed) {
            return parsed;
        }
    }

    if (isCommonConversationExport(data)) {
        return [data];
    }

    throw new Error('Input does not match a supported translation JSON shape.');
};

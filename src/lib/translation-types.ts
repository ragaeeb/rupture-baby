/**
 * Common export format for normalized LLM conversation data.
 * This is the unified format all translation files are converted to.
 */

import type { RupturePatches } from './translation-patches';

export const COMMON_FORMAT = 'common' as const;

export type AIModel = 'gemini-3-pro' | 'grok-4' | 'gpt-5-4-thinking' | 'gpt-5-4-pro';

/**
 * Normalized conversation export with prompt, response, and reasoning.
 */
export type CommonConversationExport = {
    /** Format identifier - always 'common' */
    format: typeof COMMON_FORMAT;
    /** Platform name (e.g., 'Grok', 'ChatGPT', 'Gemini') */
    llm: string;
    /** Specific model name if available */
    model?: string;
    /** Conversation title */
    title?: string;
    /** Unique conversation ID */
    conversation_id?: string;
    /** ISO timestamp when conversation was created */
    created_at?: string;
    /** ISO timestamp when conversation was last updated */
    updated_at?: string;
    /** The user's prompt */
    prompt: string;
    /** The assistant's response */
    response: string;
    /** Array of reasoning/thought steps */
    reasoning: string[];
    /** Optional Blackiya metadata for legacy exports */
    __blackiya?: Record<string, unknown>;
    /** Optional Rupture metadata for file-level patches */
    __rupture?: { patches?: RupturePatches };
};

/**
 * Single Grok conversation format (after splitting from mass export).
 * This is a single conversation object without the wrapper array.
 */
export type GrokSingleConversation = {
    conversation: {
        id: string;
        user_id: string;
        anon_user_id: string | null;
        create_time: string; // ISO timestamp
        modify_time: string; // ISO timestamp
        system_prompt_id: string | null;
        temporary: boolean;
        leaf_response_id: string | null;
        title: string;
        summary: string;
        asset_ids: unknown[];
        root_asset_id: string | null;
        x_user_id: string | null;
        starred: boolean;
        system_prompt_name: string;
        media_types: unknown[];
        controller: string | null;
        task_result_id: string | null;
        team_id: string | null;
        shared_with_team: string | null;
        shared_with_user_ids: string | null;
    };
    responses: Array<{ response: { _id: string; conversation_id: string; message: string } }>;
};

/**
 * Blackiya original format - single conversation with mapping structure.
 */
export type BlackiyaOriginal = {
    title: string;
    create_time: number; // Unix timestamp (seconds)
    update_time: number; // Unix timestamp (seconds)
    mapping: Record<string, MessageNode>;
    conversation_id: string;
    current_node: string;
    moderation_results: unknown[];
    plugin_ids: string[] | null;
    gizmo_id: string | null;
    gizmo_type: string | null;
    is_archived: boolean;
    default_model_slug: string;
    safe_urls: string[];
    blocked_urls: string[];
};

/**
 * Author information for a message
 */
export type Author = {
    role: 'system' | 'user' | 'assistant' | 'tool';
    name: string | null;
    metadata: Record<string, unknown>;
};

/**
 * Content of a message
 */
export type MessageContent = {
    content_type: 'text' | 'thoughts' | 'reasoning_recap' | 'code' | 'execution_output';
    parts?: string[];
    thoughts?: Array<{ summary: string; content: string; chunks: string[]; finished: boolean }>;
    content?: string;
};

/**
 * A single message in a conversation
 */
export type Message = {
    id: string;
    author: Author | null;
    create_time: number | null;
    update_time: number | null;
    content: MessageContent;
    status: 'finished_successfully' | 'in_progress' | 'error';
    end_turn: boolean | null;
    weight: number;
    metadata: Record<string, unknown>;
    recipient: string;
    channel: string | null;
};

/**
 * A node in the conversation message tree
 */
export type MessageNode = { id: string; message: Message | null; parent: string | null; children: string[] };

/**
 * A single segment (Arabic source excerpt) identified by an ID.
 *
 * Canonical shape (breaking change): `{ id, text }`.
 *
 * @example
 * const seg: Segment = { id: 'P1', text: 'نص عربي...' };
 */
export type Segment = { id: string; text: string };

/**
 * Wrapper format for legacy exports
 */
export type LegacyWrapper = {
    format?: string;
    data?: unknown;
    payload?: unknown;
    provider?: string;
    __blackiya?: Record<string, unknown>;
};

/**
 * Union type for all supported input formats
 */
export type TranslationInput =
    | CommonConversationExport
    | GrokSingleConversation
    | BlackiyaOriginal
    | (LegacyWrapper & { data?: unknown; payload?: unknown });

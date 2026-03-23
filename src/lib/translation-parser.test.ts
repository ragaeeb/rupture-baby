import { describe, expect, it } from 'bun:test';
import { parseTranslationToCommon } from './translation-parser';

describe('parseTranslationToCommon - Grok Mass Export', () => {
    it('should parse single conversation from Grok mass export', () => {
        const input = {
            conversations: [
                {
                    conversation: {
                        anon_user_id: null,
                        create_time: '2026-03-18T15:12:37.961673Z',
                        id: 'e74e36e3-c2b1-4219-85ec-5218d7e748aa',
                        modify_time: '2026-03-18T15:15:08.937694Z',
                        starred: false,
                        summary: '',
                        system_prompt_name: '',
                        temporary: false,
                        title: 'Expert Classical Islamic Text Translation Rules',
                        user_id: '6e54de33-3946-4f49-ae90-39c7fc4f01c2',
                    },
                    responses: [
                        {
                            response: {
                                _id: '84cadaf5-e3dc-44b2-b6ff-ca1ec1c7c72e',
                                conversation_id: 'e74e36e3-c2b1-4219-85ec-5218d7e748aa',
                                message: 'ROLE: Expert academic translator of Classical Islamic texts...',
                            },
                        },
                    ],
                },
            ],
        };

        const result = parseTranslationToCommon(input);

        expect(result).toHaveLength(1);
        expect(result[0].format).toBe('common');
        expect(result[0].llm).toBe('Grok');
        expect(result[0].title).toBe('Expert Classical Islamic Text Translation Rules');
        expect(result[0].conversation_id).toBe('e74e36e3-c2b1-4219-85ec-5218d7e748aa');
        expect(result[0].created_at).toBe('2026-03-18T15:12:37.961673Z');
        expect(result[0].updated_at).toBe('2026-03-18T15:15:08.937694Z');
        expect(result[0].prompt).toBe('');
        expect(result[0].response).toContain('ROLE: Expert academic translator');
        expect(result[0].reasoning).toEqual([]);
    });

    it('should parse multiple conversations from Grok mass export', () => {
        const input = {
            conversations: [
                {
                    conversation: {
                        anon_user_id: null,
                        create_time: '2026-03-18T10:00:00Z',
                        id: 'conv-1',
                        modify_time: '2026-03-18T10:05:00Z',
                        starred: false,
                        summary: '',
                        system_prompt_name: '',
                        temporary: false,
                        title: 'First Conversation',
                        user_id: 'user-1',
                    },
                    responses: [
                        { response: { _id: 'resp-1', conversation_id: 'conv-1', message: 'First response content' } },
                    ],
                },
                {
                    conversation: {
                        anon_user_id: null,
                        create_time: '2026-03-18T11:00:00Z',
                        id: 'conv-2',
                        modify_time: '2026-03-18T11:10:00Z',
                        starred: false,
                        summary: '',
                        system_prompt_name: '',
                        temporary: false,
                        title: 'Second Conversation',
                        user_id: 'user-1',
                    },
                    responses: [
                        { response: { _id: 'resp-2', conversation_id: 'conv-2', message: 'Second response content' } },
                    ],
                },
            ],
        };

        const result = parseTranslationToCommon(input);

        expect(result).toHaveLength(2);
        expect(result[0].conversation_id).toBe('conv-1');
        expect(result[0].title).toBe('First Conversation');
        expect(result[1].conversation_id).toBe('conv-2');
        expect(result[1].title).toBe('Second Conversation');
    });

    it('should handle Grok export with model slug in conversation', () => {
        const input = {
            conversations: [
                {
                    conversation: {
                        anon_user_id: null,
                        create_time: '2026-03-18T10:00:00Z',
                        id: 'conv-1',
                        modify_time: '2026-03-18T10:05:00Z',
                        starred: false,
                        summary: '',
                        system_prompt_name: '',
                        temporary: false,
                        title: 'Grok Conversation',
                        user_id: 'user-1',
                    },
                    responses: [
                        { response: { _id: 'resp-1', conversation_id: 'conv-1', message: 'Response with grok model' } },
                    ],
                },
            ],
        };

        const result = parseTranslationToCommon(input);

        expect(result[0].llm).toBe('Grok');
    });

    it('should handle empty conversations array', () => {
        const input = { conversations: [] };

        const result = parseTranslationToCommon(input);

        expect(result).toEqual([]);
    });

    it('should handle conversation with no responses', () => {
        const input = {
            conversations: [
                {
                    conversation: {
                        anon_user_id: null,
                        create_time: '2026-03-18T10:00:00Z',
                        id: 'conv-empty',
                        modify_time: '2026-03-18T10:05:00Z',
                        starred: false,
                        summary: '',
                        system_prompt_name: '',
                        temporary: false,
                        title: 'Empty Conversation',
                        user_id: 'user-1',
                    },
                    responses: [],
                },
            ],
        };

        const result = parseTranslationToCommon(input);

        expect(result).toHaveLength(1);
        expect(result[0].response).toBe('');
    });
});

describe('parseTranslationToCommon - Blackiya Original Format', () => {
    it('should parse Blackiya original format with thoughts', () => {
        const input = {
            blocked_urls: [],
            conversation_id: 'conversation-123',
            create_time: 1_700_000_000,
            current_node: 'assistant-final',
            default_model_slug: 'gpt-5',
            gizmo_id: null,
            gizmo_type: null,
            is_archived: false,
            mapping: {
                'assistant-final': {
                    children: [],
                    id: 'assistant-final',
                    message: {
                        author: { metadata: {}, name: 'Assistant', role: 'assistant' },
                        channel: null,
                        content: { content_type: 'text', parts: ['Here is the translation.'] },
                        create_time: 1_700_000_030,
                        end_turn: true,
                        id: 'assistant-final',
                        metadata: {},
                        recipient: 'all',
                        status: 'finished_successfully',
                        update_time: 1_700_000_030,
                        weight: 1,
                    },
                    parent: 'assistant-thoughts',
                },
                'assistant-thoughts': {
                    children: ['assistant-final'],
                    id: 'assistant-thoughts',
                    message: {
                        author: { metadata: {}, name: 'Assistant', role: 'assistant' },
                        channel: null,
                        content: {
                            content_type: 'thoughts',
                            thoughts: [
                                { chunks: [], content: 'First reasoning step.', finished: true, summary: 'Plan A' },
                            ],
                        },
                        create_time: 1_700_000_020,
                        end_turn: false,
                        id: 'assistant-thoughts',
                        metadata: {},
                        recipient: 'all',
                        status: 'finished_successfully',
                        update_time: 1_700_000_020,
                        weight: 1,
                    },
                    parent: 'user',
                },
                root: { children: ['user'], id: 'root', message: null, parent: null },
                user: {
                    children: ['assistant-thoughts'],
                    id: 'user',
                    message: {
                        author: { metadata: {}, name: 'User', role: 'user' },
                        channel: null,
                        content: { content_type: 'text', parts: ['Translate this.'] },
                        create_time: 1_700_000_010,
                        end_turn: true,
                        id: 'user',
                        metadata: {},
                        recipient: 'all',
                        status: 'finished_successfully',
                        update_time: 1_700_000_010,
                        weight: 1,
                    },
                    parent: 'root',
                },
            },
            moderation_results: [],
            plugin_ids: null,
            safe_urls: [],
            title: 'Thought Capture',
            update_time: 1_700_000_100,
        };

        const result = parseTranslationToCommon(input);

        expect(result).toHaveLength(1);
        expect(result[0].format).toBe('common');
        expect(result[0].llm).toBe('ChatGPT');
        expect(result[0].model).toBe('gpt-5');
        expect(result[0].title).toBe('Thought Capture');
        expect(result[0].conversation_id).toBe('conversation-123');
        expect(result[0].prompt).toBe('Translate this.');
        expect(result[0].response).toBe('Here is the translation.');
        expect(result[0].reasoning).toEqual(['First reasoning step.']);
    });

    it('should infer Grok from model slug', () => {
        const input = {
            blocked_urls: [],
            conversation_id: 'grok-123',
            create_time: 1_700_000_000,
            current_node: 'assistant',
            default_model_slug: 'grok-2',
            gizmo_id: null,
            gizmo_type: null,
            is_archived: false,
            mapping: {
                assistant: {
                    children: [],
                    id: 'assistant',
                    message: {
                        author: { metadata: {}, name: 'Assistant', role: 'assistant' },
                        channel: null,
                        content: { content_type: 'text', parts: ['Response'] },
                        create_time: 1_700_000_020,
                        end_turn: true,
                        id: 'assistant',
                        metadata: {},
                        recipient: 'all',
                        status: 'finished_successfully',
                        update_time: 1_700_000_020,
                        weight: 1,
                    },
                    parent: 'user',
                },
                root: { children: ['user'], id: 'root', message: null, parent: null },
                user: {
                    children: ['assistant'],
                    id: 'user',
                    message: {
                        author: { metadata: {}, name: 'User', role: 'user' },
                        channel: null,
                        content: { content_type: 'text', parts: ['Prompt'] },
                        create_time: 1_700_000_010,
                        end_turn: true,
                        id: 'user',
                        metadata: {},
                        recipient: 'all',
                        status: 'finished_successfully',
                        update_time: 1_700_000_010,
                        weight: 1,
                    },
                    parent: 'root',
                },
            },
            moderation_results: [],
            plugin_ids: null,
            safe_urls: [],
            title: 'Grok Conversation',
            update_time: 1_700_000_100,
        };

        const result = parseTranslationToCommon(input);

        expect(result[0].llm).toBe('Grok');
    });

    it('should infer Gemini from model slug', () => {
        const input = {
            blocked_urls: [],
            conversation_id: 'gemini-123',
            create_time: 1_700_000_000,
            current_node: 'assistant',
            default_model_slug: 'gemini-2.5-pro',
            gizmo_id: null,
            gizmo_type: null,
            is_archived: false,
            mapping: {
                assistant: {
                    children: [],
                    id: 'assistant',
                    message: {
                        author: { metadata: {}, name: 'Assistant', role: 'assistant' },
                        channel: null,
                        content: { content_type: 'text', parts: ['Response'] },
                        create_time: 1_700_000_020,
                        end_turn: true,
                        id: 'assistant',
                        metadata: {},
                        recipient: 'all',
                        status: 'finished_successfully',
                        update_time: 1_700_000_020,
                        weight: 1,
                    },
                    parent: 'user',
                },
                root: { children: ['user'], id: 'root', message: null, parent: null },
                user: {
                    children: ['assistant'],
                    id: 'user',
                    message: {
                        author: { metadata: {}, name: 'User', role: 'user' },
                        channel: null,
                        content: { content_type: 'text', parts: ['Prompt'] },
                        create_time: 1_700_000_010,
                        end_turn: true,
                        id: 'user',
                        metadata: {},
                        recipient: 'all',
                        status: 'finished_successfully',
                        update_time: 1_700_000_010,
                        weight: 1,
                    },
                    parent: 'root',
                },
            },
            moderation_results: [],
            plugin_ids: null,
            safe_urls: [],
            title: 'Gemini Conversation',
            update_time: 1_700_000_100,
        };

        const result = parseTranslationToCommon(input);

        expect(result[0].llm).toBe('Gemini');
    });

    it('should handle legacy wrapper format', () => {
        const conversation = {
            blocked_urls: [],
            conversation_id: 'wrapped-123',
            create_time: 1_700_000_000,
            current_node: 'assistant',
            default_model_slug: 'gpt-5',
            gizmo_id: null,
            gizmo_type: null,
            is_archived: false,
            mapping: {
                assistant: {
                    children: [],
                    id: 'assistant',
                    message: {
                        author: { metadata: {}, name: 'Assistant', role: 'assistant' },
                        channel: null,
                        content: { content_type: 'text', parts: ['Response'] },
                        create_time: 1_700_000_020,
                        end_turn: true,
                        id: 'assistant',
                        metadata: {},
                        recipient: 'all',
                        status: 'finished_successfully',
                        update_time: 1_700_000_020,
                        weight: 1,
                    },
                    parent: 'user',
                },
                root: { children: ['user'], id: 'root', message: null, parent: null },
                user: {
                    children: ['assistant'],
                    id: 'user',
                    message: {
                        author: { metadata: {}, name: 'User', role: 'user' },
                        channel: null,
                        content: { content_type: 'text', parts: ['Prompt'] },
                        create_time: 1_700_000_010,
                        end_turn: true,
                        id: 'user',
                        metadata: {},
                        recipient: 'all',
                        status: 'finished_successfully',
                        update_time: 1_700_000_010,
                        weight: 1,
                    },
                    parent: 'root',
                },
            },
            moderation_results: [],
            plugin_ids: null,
            safe_urls: [],
            title: 'Wrapped Conversation',
            update_time: 1_700_000_100,
        };

        const input = { __blackiya: { exportMeta: { source: 'test' } }, data: conversation, format: 'original' };

        const result = parseTranslationToCommon(input);

        expect(result[0].title).toBe('Wrapped Conversation');
        expect(result[0].__blackiya).toEqual({ exportMeta: { source: 'test' } });
    });

    it('should throw on unsupported format', () => {
        const input = { hello: 'world' };

        expect(() => parseTranslationToCommon(input)).toThrow(
            'Input does not match a supported translation JSON shape',
        );
    });
});

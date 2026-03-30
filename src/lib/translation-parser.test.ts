import { describe, expect, it } from 'bun:test';
import { parseTranslationToCommon } from './translation-parser';
import type { MessageNode } from './translation-types';

const ruptureMeta = { patches: { P1: { ops: [{ end: 4, start: 0, text: 'patch' }] } } };

describe('parseTranslationToCommon - Grok Conversation', () => {
    it('should parse single conversation object', () => {
        const input = {
            __rupture: ruptureMeta,
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
                        sender: 'ASSISTANT',
                    },
                },
            ],
        };

        const result = parseTranslationToCommon(input);

        expect(result.format).toBe('common');
        expect(result.llm).toBe('Grok');
        expect(result.title).toBe('Expert Classical Islamic Text Translation Rules');
        expect(result.conversation_id).toBe('e74e36e3-c2b1-4219-85ec-5218d7e748aa');
        expect(result.created_at).toBe('2026-03-18T15:12:37.961673Z');
        expect(result.updated_at).toBe('2026-03-18T15:15:08.937694Z');
        expect(result.prompt).toBe('');
        expect(result.response).toContain('ROLE: Expert academic translator');
        expect(result.reasoning).toEqual([]);
        expect(result.__rupture).toEqual(ruptureMeta);
    });

    it('should parse Grok-4 prompt, reasoning, model, and thinking duration from responses', () => {
        const input = {
            conversation: {
                anon_user_id: null,
                asset_ids: [],
                controller: null,
                create_time: '2026-03-29T03:34:38.908849Z',
                id: '03c13c13-8dd1-4cb1-99da-f100c635a1e5',
                leaf_response_id: null,
                media_types: [],
                modify_time: '2026-03-29T03:36:56.934358Z',
                root_asset_id: null,
                shared_with_team: null,
                shared_with_user_ids: [],
                starred: false,
                summary: '',
                system_prompt_id: null,
                system_prompt_name: '',
                task_result_id: null,
                team_id: null,
                temporary: false,
                title: 'Expert Translator Rules for Classical Islamic Texts',
                user_id: '205c6e87-29d6-41e5-ae78-1d64107c8f20',
                x_user_id: '1102807310827704330',
            },
            responses: [
                {
                    response: {
                        _id: '806a1633-d14e-4608-8752-43d2b387997a',
                        conversation_id: '03c13c13-8dd1-4cb1-99da-f100c635a1e5',
                        create_time: { $date: { $numberLong: '1774755278931' } },
                        message: '....this is the prompt...',
                        metadata: {},
                        model: 'grok-4',
                        sender: 'human',
                    },
                    share_link: null,
                },
                {
                    response: {
                        _id: 'dc13b49d-a828-498e-bbcb-f15119c4aaaa',
                        agent_thinking_traces: [{ agent_id: { rollout_id: '0' }, thinking_trace: 'Reasoning notes' }],
                        conversation_id: '03c13c13-8dd1-4cb1-99da-f100c635a1e5',
                        create_time: { $date: { $numberLong: '1774755416532' } },
                        message: '...this is the LLM response',
                        metadata: { request_metadata: { effort: 'high', mode: 'expert', model: 'grok-4' } },
                        model: 'grok-4',
                        sender: 'ASSISTANT',
                        steps: [
                            { tag_order: ['header'], tagged_text: { header: 'Thinking about your request' } },
                            { tag_order: ['header'], tagged_text: { header: 'Translating segments' } },
                            { tag_order: ['summary'], tagged_text: { summary: 'More reasoning notes...' } },
                            { tag_order: ['header'], tagged_text: { header: 'Translating segments' } },
                            { tag_order: ['summary'], tagged_text: { summary: '...more reasoning notes' } },
                        ],
                        thinking_end_time: { $date: { $numberLong: '1774755398508' } },
                        thinking_start_time: { $date: { $numberLong: '1774755278975' } },
                    },
                    share_link: null,
                },
            ],
        };

        const result = parseTranslationToCommon(input);

        expect(result.llm).toBe('Grok');
        expect(result.model).toBe('grok-4');
        expect(result.prompt).toBe('....this is the prompt...');
        expect(result.response).toBe('...this is the LLM response');
        expect(result.reasoning).toEqual([
            'Reasoning notes',
            'Thinking about your request',
            'Translating segments',
            'More reasoning notes...',
            '...more reasoning notes',
        ]);
        expect(result.reasoning_duration_sec).toBe(120);
    });
});

describe('parseTranslationToCommon - Blackiya Original Format', () => {
    const createBaseInput = () => ({
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
                        thoughts: [{ chunks: [], content: 'First reasoning step.', finished: true, summary: 'Plan A' }],
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
    });

    it('should parse Blackiya original format with thoughts', () => {
        const input = createBaseInput();

        const result = parseTranslationToCommon(input);

        expect(result.format).toBe('common');
        expect(result.llm).toBe('ChatGPT');
        expect(result.model).toBe('gpt-5');
        expect(result.title).toBe('Thought Capture');
        expect(result.conversation_id).toBe('conversation-123');
        expect(result.prompt).toBe('Translate this.');
        expect(result.response).toBe('Here is the translation.');
        expect(result.reasoning).toEqual(['First reasoning step.']);
        expect(result.reasoning_duration_sec).toBeUndefined();
    });

    it('should capture GPT reasoning duration from the terminal assistant response metadata', () => {
        const input = createBaseInput();
        const mapping = input.mapping as Record<string, MessageNode>;

        mapping['assistant-recap'] = {
            children: ['assistant-final'],
            id: 'assistant-recap',
            message: {
                author: { metadata: {}, name: 'Assistant', role: 'assistant' },
                channel: null,
                content: { content: 'Thought for 22s', content_type: 'reasoning_recap' },
                create_time: 1_700_000_025,
                end_turn: false,
                id: 'assistant-recap',
                metadata: { finished_duration_sec: 22 },
                recipient: 'all',
                status: 'finished_successfully',
                update_time: 1_700_000_025,
                weight: 1,
            },
            parent: 'assistant-thoughts',
        };
        mapping['assistant-thoughts'].children = ['assistant-recap'];
        mapping['assistant-final'].parent = 'assistant-recap';

        const result = parseTranslationToCommon(input);

        expect(result.reasoning_duration_sec).toBe(22);
    });

    it('should derive Gemini reasoning duration from assistant turn timestamps when available', () => {
        const input = createBaseInput();
        input.default_model_slug = 'gemini-3-pro';
        input.mapping['assistant-thoughts'].message.create_time = 1_700_000_020;
        input.mapping['assistant-thoughts'].message.update_time = 1_700_000_035;
        input.mapping['assistant-final'].message.create_time = 1_700_000_038;
        input.mapping['assistant-final'].message.update_time = 1_700_000_041;

        const result = parseTranslationToCommon(input);

        expect(result.reasoning_duration_sec).toBe(21);
    });

    it('should derive Grok reasoning duration from assistant timestamps when available', () => {
        const input = createBaseInput();
        input.default_model_slug = 'grok-4';
        input.mapping['assistant-thoughts'].message.create_time = 1_700_000_020;
        input.mapping['assistant-thoughts'].message.update_time = 1_700_000_028;
        input.mapping['assistant-final'].message.create_time = 1_700_000_032;
        input.mapping['assistant-final'].message.update_time = 1_700_000_036;

        const result = parseTranslationToCommon(input);

        expect(result.reasoning_duration_sec).toBe(16);
    });

    it('should leave Gemini reasoning duration undefined when the export has no usable timing delta', () => {
        const input = createBaseInput();
        input.default_model_slug = 'gemini-3-pro';
        input.mapping['assistant-thoughts'].message.create_time = 1_700_000_020;
        input.mapping['assistant-thoughts'].message.update_time = 1_700_000_020;
        input.mapping['assistant-final'].message.create_time = 1_700_000_020;
        input.mapping['assistant-final'].message.update_time = 1_700_000_020;

        const result = parseTranslationToCommon(input);

        expect(result.reasoning_duration_sec).toBeUndefined();
    });

    it('should leave Grok reasoning duration undefined when the export has no usable timing delta', () => {
        const input = createBaseInput();
        input.default_model_slug = 'grok-4';
        const thoughtsMessage = input.mapping['assistant-thoughts'].message as {
            create_time: number;
            update_time: number | null;
        };
        const finalMessage = input.mapping['assistant-final'].message as {
            create_time: number;
            update_time: number | null;
        };
        thoughtsMessage.create_time = 1_700_000_020;
        thoughtsMessage.update_time = null;
        finalMessage.create_time = 1_700_000_020;
        finalMessage.update_time = null;

        const result = parseTranslationToCommon(input);

        expect(result.reasoning_duration_sec).toBeUndefined();
    });

    it('should infer Grok from model slug', () => {
        const input = { ...createBaseInput(), conversation_id: 'grok-123', default_model_slug: 'grok-2' };

        const result = parseTranslationToCommon(input);

        expect(result.llm).toBe('Grok');
    });

    it('should infer Gemini from model slug', () => {
        const input = { ...createBaseInput(), conversation_id: 'gemini-123', default_model_slug: 'gemini-2.5-pro' };

        const result = parseTranslationToCommon(input);

        expect(result.llm).toBe('Gemini');
    });

    it('should handle legacy wrapper format', () => {
        const conversation = createBaseInput();

        const input = {
            __blackiya: { exportMeta: { source: 'test' } },
            __rupture: ruptureMeta,
            data: conversation,
            format: 'original',
        };

        const result = parseTranslationToCommon(input);

        expect(result.title).toBe('Thought Capture');
        expect(result.__blackiya).toEqual({ exportMeta: { source: 'test' } });
        expect(result.__rupture).toEqual(ruptureMeta);
    });

    it('should throw on unsupported format', () => {
        const input = { hello: 'world' };

        expect(() => parseTranslationToCommon(input)).toThrow(
            'Input does not match a supported translation JSON shape',
        );
    });
});

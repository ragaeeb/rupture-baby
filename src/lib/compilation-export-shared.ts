import { LLMProvider } from 'bitaboom';

export const DEFAULT_COMPILATION_EXPORT_PROVIDER = LLMProvider.OpenAI;
export const DEFAULT_COMPILATION_EXPORT_CONTEXT_WINDOW_TOKENS = 100_000;
export const DEFAULT_COMPILATION_EXPORT_RESERVED_TOKENS = 12_000;
export const MAX_COMPILATION_EXPORT_CONTEXT_WINDOW_TOKENS = 2_000_000;
export const MAX_COMPILATION_EXPORT_RESERVED_TOKENS = 500_000;

export const COMPILATION_EXPORT_PROVIDER_OPTIONS = [
    {
        description: 'Use this for GPT-5.x style exports, including GPT 5.5 workflows.',
        id: LLMProvider.OpenAI,
        label: 'OpenAI Tokenizer',
    },
    {
        description: 'Use this when the destination model uses Gemini token counting.',
        id: LLMProvider.Gemini,
        label: 'Gemini Tokenizer',
    },
    {
        description: 'Use this when the destination model uses Grok token counting.',
        id: LLMProvider.Grok,
        label: 'Grok Tokenizer',
    },
] as const;

export type CompilationExportProviderId = (typeof COMPILATION_EXPORT_PROVIDER_OPTIONS)[number]['id'];

export const isCompilationExportProviderId = (value: unknown): value is CompilationExportProviderId =>
    COMPILATION_EXPORT_PROVIDER_OPTIONS.some((option) => option.id === value);

import { LLMProvider } from 'bitaboom';

export type TranslationModel = { id: string; label: string; provider: LLMProvider };

export const TRANSLATION_MODELS: readonly TranslationModel[] = [
    { id: '879', label: 'GPT 5o', provider: LLMProvider.OpenAI },
    { id: '890', label: 'Gemini 3.0 Pro', provider: LLMProvider.Gemini },
    { id: '893', label: 'OpenAI GPT 5.2 Thinking', provider: LLMProvider.OpenAI },
    { id: '895', label: 'Grok 4 Expert', provider: LLMProvider.Grok },
];

export const DEFAULT_MODEL_ID = TRANSLATION_MODELS[0].id;

export const getTranslationModelById = (modelId: string) => TRANSLATION_MODELS.find((model) => model.id === modelId);

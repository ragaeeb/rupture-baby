import '@tanstack/react-start/server-only';

import { huggingFaceTranslationAssistProvider } from '@/lib/llm/providers/huggingface';
import type { TranslationAssistProvider } from '@/lib/llm/types';

export const getTranslationAssistProvider = (): TranslationAssistProvider => huggingFaceTranslationAssistProvider;

export const getTranslationAssistProviderInfo = () => ({
    model: huggingFaceTranslationAssistProvider.model,
    provider: 'huggingface' as const,
});

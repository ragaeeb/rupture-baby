import '@tanstack/react-start/server-only';

import { getDefaultAssistProvider } from '@/lib/app-settings';
import {
    CLOUD_FLARE_PROVIDER_ID,
    cloudflareTranslationAssistProvider,
    getCloudflareAssistModel,
} from '@/lib/llm/providers/cloudflare';
import { GEMINI_PROVIDER_ID, getGoogleAssistModel, googleTranslationAssistProvider } from '@/lib/llm/providers/google';
import { huggingFaceTranslationAssistProvider } from '@/lib/llm/providers/huggingface';
import type { TranslationAssistProvider } from '@/lib/llm/types';
import type { AssistProviderId } from '@/lib/shell-types';

const PROVIDERS = {
    cloudflare: cloudflareTranslationAssistProvider,
    gemini: googleTranslationAssistProvider,
    hf: huggingFaceTranslationAssistProvider,
} as const satisfies Record<string, TranslationAssistProvider>;

export const getTranslationAssistProvider = async (
    providerId?: AssistProviderId,
): Promise<TranslationAssistProvider> => {
    return PROVIDERS[providerId ?? getDefaultAssistProvider()];
};

export const getTranslationAssistProviderInfo = async () => {
    const selectedAssistProvider = getDefaultAssistProvider();
    const provider = PROVIDERS[selectedAssistProvider];

    return {
        configuredModel:
            selectedAssistProvider === CLOUD_FLARE_PROVIDER_ID
                ? getCloudflareAssistModel()
                : selectedAssistProvider === GEMINI_PROVIDER_ID
                  ? getGoogleAssistModel()
                  : provider.model,
        provider: selectedAssistProvider,
    };
};

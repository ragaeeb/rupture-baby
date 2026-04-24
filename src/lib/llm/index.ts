import '@tanstack/react-start/server-only';

import { getDefaultAssistProvider } from '@/lib/app-settings';
import {
    CLOUD_FLARE_PROVIDER_ID,
    cloudflareTranslationAssistProvider,
    getCloudflareAssistModel,
} from '@/lib/llm/providers/cloudflare';
import { GEMINI_PROVIDER_ID, getGoogleAssistModel, googleTranslationAssistProvider } from '@/lib/llm/providers/google';
import { huggingFaceTranslationAssistProvider } from '@/lib/llm/providers/huggingface';
import {
    nvidiaGlm47TranslationAssistProvider,
    nvidiaKimiK2ThinkingTranslationAssistProvider,
} from '@/lib/llm/providers/nvidia';
import type { TranslationAssistProvider } from '@/lib/llm/types';
import type { AssistProviderId } from '@/lib/shell-types';

const PROVIDERS = {
    cloudflare: cloudflareTranslationAssistProvider,
    gemini: googleTranslationAssistProvider,
    hf: huggingFaceTranslationAssistProvider,
    'nvidia-glm47': nvidiaGlm47TranslationAssistProvider,
    'nvidia-kimi-k2-thinking': nvidiaKimiK2ThinkingTranslationAssistProvider,
} as const satisfies Record<AssistProviderId, TranslationAssistProvider>;

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

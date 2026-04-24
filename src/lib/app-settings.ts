import '@tanstack/react-start/server-only';

import { isAssistProviderId } from '@/lib/assist-provider-ids';
import {
    CLOUD_FLARE_PROVIDER_ID,
    getCloudflareAssistModel,
    isCloudflareAssistConfigured,
} from '@/lib/llm/providers/cloudflare';
import { GEMINI_PROVIDER_ID, getGoogleAssistModel, isGoogleAssistConfigured } from '@/lib/llm/providers/google';
import {
    getHuggingFaceAssistModel,
    HUGGING_FACE_PROVIDER_ID,
    isHuggingFaceAssistConfigured,
} from '@/lib/llm/providers/huggingface';
import {
    isNvidiaAssistConfigured,
    NVIDIA_GLM47_MODEL,
    NVIDIA_GLM47_PROVIDER_ID,
    NVIDIA_KIMI_K2_THINKING_MODEL,
    NVIDIA_KIMI_K2_THINKING_PROVIDER_ID,
} from '@/lib/llm/providers/nvidia';
import type { AppSettingsResponse, AssistProviderId, AssistProviderOption } from '@/lib/shell-types';

export const getProviderOptions = (): AssistProviderOption[] => [
    {
        id: NVIDIA_GLM47_PROVIDER_ID,
        isConfigured: isNvidiaAssistConfigured(),
        label: 'NVIDIA GLM-4.7',
        model: NVIDIA_GLM47_MODEL,
    },
    {
        id: NVIDIA_KIMI_K2_THINKING_PROVIDER_ID,
        isConfigured: isNvidiaAssistConfigured(),
        label: 'NVIDIA Kimi K2 Thinking',
        model: NVIDIA_KIMI_K2_THINKING_MODEL,
    },
    {
        id: HUGGING_FACE_PROVIDER_ID,
        isConfigured: isHuggingFaceAssistConfigured(),
        label: 'HF',
        model: getHuggingFaceAssistModel(),
    },
    {
        id: GEMINI_PROVIDER_ID,
        isConfigured: isGoogleAssistConfigured(),
        label: 'Gemini',
        model: getGoogleAssistModel(),
    },
    {
        id: CLOUD_FLARE_PROVIDER_ID,
        isConfigured: isCloudflareAssistConfigured(),
        label: 'Cloudflare',
        model: getCloudflareAssistModel(),
    },
];

export const getDefaultAssistProvider = (providerOptions = getProviderOptions()): AssistProviderId => {
    const envProvider = process.env.LLM_ASSIST_PROVIDER?.trim();
    if (isAssistProviderId(envProvider)) {
        return envProvider;
    }

    const nvidiaGlmProvider = providerOptions.find((provider) => provider.id === NVIDIA_GLM47_PROVIDER_ID);
    if (nvidiaGlmProvider?.isConfigured) {
        return nvidiaGlmProvider.id;
    }

    const nvidiaKimiProvider = providerOptions.find((provider) => provider.id === NVIDIA_KIMI_K2_THINKING_PROVIDER_ID);
    if (nvidiaKimiProvider?.isConfigured) {
        return nvidiaKimiProvider.id;
    }

    const huggingFaceProvider = providerOptions.find((provider) => provider.id === HUGGING_FACE_PROVIDER_ID);
    if (huggingFaceProvider?.isConfigured) {
        return huggingFaceProvider.id;
    }

    const geminiProvider = providerOptions.find((provider) => provider.id === GEMINI_PROVIDER_ID);
    if (geminiProvider?.isConfigured) {
        return geminiProvider.id;
    }

    const cloudflareProvider = providerOptions.find((provider) => provider.id === CLOUD_FLARE_PROVIDER_ID);
    if (cloudflareProvider?.isConfigured) {
        return cloudflareProvider.id;
    }

    return HUGGING_FACE_PROVIDER_ID;
};

export const getAppSettings = async (): Promise<AppSettingsResponse> => {
    const providers = getProviderOptions();
    return { providers, selectedAssistProvider: getDefaultAssistProvider(providers) };
};

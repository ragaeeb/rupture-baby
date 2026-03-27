import '@tanstack/react-start/server-only';

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
import type { AppSettingsResponse, AssistProviderId, AssistProviderOption } from '@/lib/shell-types';

const isAssistProviderId = (value: unknown): value is AssistProviderId =>
    value === HUGGING_FACE_PROVIDER_ID || value === GEMINI_PROVIDER_ID || value === CLOUD_FLARE_PROVIDER_ID;

export const getProviderOptions = (): AssistProviderOption[] => [
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

    const cloudflareProvider = providerOptions.find((provider) => provider.id === CLOUD_FLARE_PROVIDER_ID);
    if (cloudflareProvider?.isConfigured) {
        return cloudflareProvider.id;
    }

    const huggingFaceProvider = providerOptions.find((provider) => provider.id === HUGGING_FACE_PROVIDER_ID);
    if (huggingFaceProvider?.isConfigured) {
        return huggingFaceProvider.id;
    }

    const geminiProvider = providerOptions.find((provider) => provider.id === GEMINI_PROVIDER_ID);
    if (geminiProvider?.isConfigured) {
        return geminiProvider.id;
    }

    return HUGGING_FACE_PROVIDER_ID;
};

export const getAppSettings = async (): Promise<AppSettingsResponse> => {
    const providers = getProviderOptions();
    return { providers, selectedAssistProvider: getDefaultAssistProvider(providers) };
};

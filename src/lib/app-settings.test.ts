import { afterEach, describe, expect, it } from 'bun:test';

import { getDefaultAssistProvider, getProviderOptions } from './app-settings';

const PROVIDER_ENV_KEYS = [
    'CLOUDFLARE_ACCOUNT_ID',
    'CLOUDFLARE_WORKERS_AI_TOKEN',
    'GOOGLE_API_KEY',
    'HF_MODEL_TOKEN',
    'LLM_ASSIST_PROVIDER',
    'NVIDIA_API_KEY',
    'NVIDIA_NIM_API_KEY',
] as const;

const originalEnv = new Map(PROVIDER_ENV_KEYS.map((key) => [key, process.env[key]] as const));

const resetProviderEnv = () => {
    for (const key of PROVIDER_ENV_KEYS) {
        delete process.env[key];
    }
};

afterEach(() => {
    resetProviderEnv();

    for (const [key, value] of originalEnv) {
        if (typeof value === 'string') {
            process.env[key] = value;
        }
    }
});

describe('getDefaultAssistProvider', () => {
    it('should prefer nvidia glm when nvidia is configured', () => {
        resetProviderEnv();
        process.env.NVIDIA_API_KEY = 'test-nvidia-key';

        expect(getDefaultAssistProvider(getProviderOptions())).toBe('nvidia-glm47');
    });

    it('should honor an explicit nvidia provider override', () => {
        resetProviderEnv();
        process.env.LLM_ASSIST_PROVIDER = 'nvidia-kimi-k2-thinking';

        expect(getDefaultAssistProvider(getProviderOptions())).toBe('nvidia-kimi-k2-thinking');
    });
});

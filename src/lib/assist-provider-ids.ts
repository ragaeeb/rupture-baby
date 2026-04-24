export const ASSIST_PROVIDER_IDS = ['cloudflare', 'gemini', 'hf', 'nvidia-glm47', 'nvidia-kimi-k2-thinking'] as const;

export type AssistProviderId = (typeof ASSIST_PROVIDER_IDS)[number];

export const isAssistProviderId = (value: unknown): value is AssistProviderId =>
    typeof value === 'string' && ASSIST_PROVIDER_IDS.includes(value as AssistProviderId);

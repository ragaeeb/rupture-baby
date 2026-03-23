import { LLMProvider } from 'bitaboom';

export const mapJsonToPlatform = (json: any) => {
    if (json.conversations || json.default_model_slug.startsWith('grok')) {
        return LLMProvider.Grok;
    }

    if (json.default_model_slug.startsWith('gpt')) {
        return LLMProvider.OpenAI;
    }

    return 'Unknown';
};

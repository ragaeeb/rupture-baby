import type { AssistProviderId, TranslationAssistRequest, TranslationAssistResponse } from '@/lib/shell-types';

export type TranslationAssistProvider = {
    id: AssistProviderId;
    model: string;
    requestAssistance: (request: TranslationAssistRequest) => Promise<TranslationAssistResponse>;
};

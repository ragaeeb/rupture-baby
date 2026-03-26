import type { TranslationAssistRequest, TranslationAssistResponse } from '@/lib/shell-types';

export type TranslationAssistProvider = {
    model: string;
    requestAssistance: (request: TranslationAssistRequest) => Promise<TranslationAssistResponse>;
};

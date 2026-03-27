import '@tanstack/react-start/server-only';

import { getTranslationAssistProvider } from '@/lib/llm';
import type { TranslationAssistRequest, TranslationAssistResponse } from './shell-types';

export const requestTranslationAssistance = async (
    request: TranslationAssistRequest,
): Promise<TranslationAssistResponse> => {
    const provider = await getTranslationAssistProvider(request.providerId);
    return provider.requestAssistance(request);
};

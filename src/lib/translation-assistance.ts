import 'server-only';

import { getTranslationAssistProvider } from '@/lib/llm';
import type { TranslationAssistRequest, TranslationAssistResponse } from './shell-types';

export const requestTranslationAssistance = async (
    request: TranslationAssistRequest,
): Promise<TranslationAssistResponse> => {
    return getTranslationAssistProvider().requestAssistance(request);
};

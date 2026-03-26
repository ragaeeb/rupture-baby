import 'server-only';

import { googleTranslationAssistProvider } from '@/lib/llm/providers/google';
import type { TranslationAssistProvider } from '@/lib/llm/types';

export const getTranslationAssistProvider = (): TranslationAssistProvider => googleTranslationAssistProvider;

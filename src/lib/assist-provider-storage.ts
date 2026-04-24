import { isAssistProviderId } from '@/lib/assist-provider-ids';
import type { AssistProviderId } from '@/lib/shell-types';

export const ASSIST_PROVIDER_STORAGE_KEY = 'rupture.assistProvider';

export const getStoredAssistProvider = (): AssistProviderId | null => {
    if (typeof window === 'undefined') {
        return null;
    }

    const storedValue = window.localStorage.getItem(ASSIST_PROVIDER_STORAGE_KEY);
    return isAssistProviderId(storedValue) ? storedValue : null;
};

export const setStoredAssistProvider = (providerId: AssistProviderId) => {
    if (typeof window === 'undefined') {
        return;
    }

    window.localStorage.setItem(ASSIST_PROVIDER_STORAGE_KEY, providerId);
};

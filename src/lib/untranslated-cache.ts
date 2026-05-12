import '@tanstack/react-start/server-only';

import { getCompilationSnapshot, getCompilationSnapshotUntranslatedPickerItems } from '@/lib/compilation-cache';
import type { Excerpt } from '@/types/compilation';

export const getCachedUntranslatedExcerpts = async (): Promise<Excerpt[]> => {
    const snapshot = await getCompilationSnapshot();
    return snapshot.untranslatedExcerpts;
};

export const getCachedUntranslatedPickerItems = async (): Promise<Excerpt[]> =>
    getCompilationSnapshotUntranslatedPickerItems();

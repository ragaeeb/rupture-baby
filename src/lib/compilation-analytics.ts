import '@tanstack/react-start/server-only';

import {
    getCompilationSnapshot,
    getCompilationSnapshotPath,
    invalidateCompilationSnapshot,
} from '@/lib/compilation-cache';

export { summarizeCompilationAnalytics } from '@/lib/compilation-metrics';

export const getCompilationAnalyticsSnapshotPath = getCompilationSnapshotPath;

export const invalidateCompilationAnalyticsCache = (filePath?: string) => {
    invalidateCompilationSnapshot(filePath);
};

export const getCompilationAnalytics = async () => {
    const snapshot = await getCompilationSnapshot();
    return snapshot.analytics;
};

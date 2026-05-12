import '@tanstack/react-start/server-only';

import {
    getCompilationSnapshot,
    getCompilationSnapshotPath,
    invalidateCompilationSnapshot,
} from '@/lib/compilation-cache';

export type { CompilationStats, CountBucket } from '@/lib/compilation-metrics';
export { summarizeCompilationStats } from '@/lib/compilation-metrics';

export const getCompilationStatsSnapshotPath = getCompilationSnapshotPath;

export const invalidateCompilationStatsCache = (filePath?: string) => {
    invalidateCompilationSnapshot(filePath);
};

export const getCompilationStats = async () => {
    const snapshot = await getCompilationSnapshot();
    return snapshot.stats;
};
